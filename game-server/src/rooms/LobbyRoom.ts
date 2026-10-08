import { Room, ServerError, type Client, type AuthContext } from '@colyseus/core'
import type { Authenticate, AuthenticatedPlayer } from '../auth/supabaseAuth.js'
import { scheduleSessionExpiry } from '../auth/sessionExpiry.js'
import { allocateLobbyCode } from '../lobby/lobbyCode.js'
import { canTransition, MAX_PLAYERS, readReady, rosterCanStart, type LobbyStatus } from '../lobby/lobbyRules.js'
import { LobbyState } from '../schema/LobbyState.js'
import { LobbyPlayerState } from '../schema/LobbyPlayerState.js'

type LobbyClient = Client<{ auth: AuthenticatedPlayer }>
export type LobbyOptions = { allocateCode?: () => string; startDelayMs?: number }

export function createLobbyRoom(authenticate: Authenticate, config: LobbyOptions = {}) {
  return class LobbyRoom extends Room<{ state: LobbyState; client: LobbyClient }> {
    static async onAuth(token: string | undefined, options: unknown, context: AuthContext) {
      if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length) throw new ServerError(400, 'INVALID_PAYLOAD')
      const path = context.req instanceof Request ? new URL(context.req.url).pathname : ''
      const creating = path === '/matchmake/create/lobby'
      if (!creating && !/^\/matchmake\/joinById\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(path)) throw new ServerError(400, 'INVALID_ACTION')
      let identity: AuthenticatedPlayer
      try { identity = await authenticate(token) } catch { throw new ServerError(401, 'AUTH_REQUIRED') }
      // This field is injected only AFTER strict input validation and verified Auth.
      // Colyseus passes these creation options to onCreate; the browser cannot set it.
      if (creating) Object.assign(options, { _creatorUserId: identity.userId })
      return identity
    }
    state = new LobbyState()
    maxClients = MAX_PLAYERS
    private creatorUserId = ''
    private creatorAdmitted = false
    private participants = new Map<string, { identity: AuthenticatedPlayer; cancelExpiry: () => void }>()
    private countdown: ReturnType<typeof setTimeout> | undefined

    async onCreate(options: { _creatorUserId?: unknown }) {
      if (typeof options._creatorUserId !== 'string' || !options._creatorUserId) throw new ServerError(401, 'AUTH_REQUIRED')
      this.creatorUserId = options._creatorUserId
      this.roomId = (config.allocateCode ?? allocateLobbyCode)()
      this.state.code = this.roomId
      this.seatReservationTimeout = 10
      this.setPatchRate(50)
      await this.setMatchmaking({ private: true, unlisted: true, locked: true })
      this.onMessage('set_ready', (client, payload: unknown) => {
        if (!this.isPresent(client)) return this.reject(client, 'NOT_PRESENT')
        if (this.state.status !== 'WAITING') return this.reject(client, 'INVALID_STATE')
        try { this.state.players.get(client.sessionId)!.ready = readReady(payload) }
        catch { this.reject(client, 'INVALID_PAYLOAD') }
      })
      this.onMessage('start_game', (client, payload: unknown) => {
        if (payload !== undefined) return this.reject(client, 'INVALID_PAYLOAD')
        if (!this.isPresent(client)) return this.reject(client, 'NOT_PRESENT')
        if (client.auth?.userId !== this.state.hostUserId) return this.reject(client, 'HOST_REQUIRED')
        if (this.state.status !== 'WAITING') return this.reject(client, 'INVALID_STATE')
        if (!this.canStart()) return this.reject(client, 'NOT_READY')
        this.transition('STARTING')
        void this.lock().then(() => {
          if (this.state.status !== 'STARTING') return
          this.countdown = setTimeout(() => {
            this.countdown = undefined
            if (this.state.status !== 'STARTING') return
            if (this.canStart()) this.transition('PLAYING')
            else this.cancelStart()
          }, config.startDelayMs ?? 3000)
        }).catch(() => this.closeLobby())
      })
    }
    async onJoin(client: LobbyClient) {
      if (!client.auth || client.auth.expiresAt <= Date.now()) throw new ServerError(401, 'AUTH_REQUIRED')
      if (this.state.status !== 'WAITING') throw new ServerError(409, 'LOBBY_STARTED')
      if (!this.creatorAdmitted && client.auth.userId !== this.creatorUserId) throw new ServerError(409, 'CREATOR_PENDING')
      if (this.state.players.size >= MAX_PLAYERS) throw new ServerError(409, 'LOBBY_FULL')
      for (const player of this.state.players.values()) {
        if (player.userId === client.auth.userId) throw new ServerError(409, 'DUPLICATE_USER')
      }
      const player = new LobbyPlayerState()
      player.userId = client.auth.userId
      player.username = client.auth.username
      player.avatarUrl = client.auth.avatarUrl ?? ''
      this.state.players.set(client.sessionId, player)
      this.participants.set(client.sessionId, { identity: client.auth, cancelExpiry: scheduleSessionExpiry(client.auth.expiresAt, () => client.leave(4001)) })
      if (!this.creatorAdmitted) {
        this.creatorAdmitted = true
        this.state.hostUserId = client.auth.userId
        await this.unlock()
      }
    }
    onLeave(client: LobbyClient) {
      const leaving = this.state.players.get(client.sessionId)
      if (!leaving) return // A rejected duplicate must never remove the original player.
      this.participants.get(client.sessionId)?.cancelExpiry()
      this.participants.delete(client.sessionId)
      this.state.players.delete(client.sessionId)
      if (!this.state.players.size) { this.closeLobby(); return }
      if (leaving.userId === this.state.hostUserId) {
        // Map insertion order is private server admission order.
        this.state.hostUserId = this.participants.values().next().value!.identity.userId
      }
      if (this.state.status === 'STARTING') this.cancelStart()
    }
    onDispose() {
      clearTimeout(this.countdown)
      for (const participant of this.participants.values()) participant.cancelExpiry()
      this.participants.clear()
    }
    private isPresent(client: LobbyClient) {
      if (client.auth && client.auth.expiresAt <= Date.now()) { client.leave(4001); return false }
      return this.state.players.has(client.sessionId) && this.participants.has(client.sessionId)
    }
    private canStart() {
      return rosterCanStart([...this.state.players].map(([id, player]) => ({ ready: player.ready, expiresAt: this.participants.get(id)?.identity.expiresAt ?? 0 })), Date.now())
    }
    private transition(next: LobbyStatus) {
      if (!canTransition(this.state.status as LobbyStatus, next)) throw new Error('Invalid lobby transition')
      this.state.status = next
    }
    private cancelStart() {
      clearTimeout(this.countdown)
      this.countdown = undefined
      this.transition('WAITING')
      for (const player of this.state.players.values()) player.ready = false
      void this.unlock().catch(() => this.closeLobby())
    }
    private closeLobby() {
      if (this.state.status === 'CLOSED') return
      this.transition('CLOSED')
      clearTimeout(this.countdown)
      void this.disconnect().catch(() => {})
    }
    private reject(client: LobbyClient, code: string) { client.send('lobby_error', { code }) }
  }
}

import { safeLog } from '../runtime/logging.js'
import { Room, ServerError, matchMaker, type Client, type AuthContext } from '@colyseus/core'
import type { Authenticate, AuthenticatedPlayer } from '../auth/supabaseAuth.js'
import { scheduleSessionExpiry } from '../auth/sessionExpiry.js'
import { allocateLobbyCode } from '../lobby/lobbyCode.js'
import { canTransition, MAX_PLAYERS, readReady, rosterCanStart, type LobbyStatus } from '../lobby/lobbyRules.js'
import { LobbyState } from '../schema/LobbyState.js'
import { LobbyPlayerState } from '../schema/LobbyPlayerState.js'
import { resolveGame, gameRegistry } from '../games/registry.js'
import type { GameDefinition, GameRegistry } from '../games/types.js'
import type { GameSessionCoordinator } from '../platform/multiplayer/GameSessionCoordinator.js'

type LobbyClient = Client<{ auth: AuthenticatedPlayer }>
export type LobbyOptions = { allocateCode?: () => string; startDelayMs?: number; registry?: GameRegistry; reserveCreation?: (userId: string) => (() => void) | undefined; available?: () => boolean }

export function createLobbyRoom(authenticate: Authenticate, coordinator: GameSessionCoordinator, config: LobbyOptions = {}) {
  return class LobbyRoom extends Room<{ state: LobbyState; client: LobbyClient }> {
    static async onAuth(token: string | undefined, options: unknown, context: AuthContext) {
      if (config.available?.() === false) throw new ServerError(503, 'UNAVAILABLE')
      if (!options || typeof options !== 'object' || Array.isArray(options)) throw new ServerError(400, 'INVALID_PAYLOAD')
      const path = context.req instanceof Request ? new URL(context.req.url).pathname : ''
      const creating = path === '/matchmake/create/lobby'
      if (!creating && !/^\/matchmake\/joinById\/[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(path)) throw new ServerError(400, 'INVALID_ACTION')
      let identity: AuthenticatedPlayer
      try { identity = await authenticate(token) } catch { throw new ServerError(401, 'AUTH_REQUIRED') }
      if (creating) {
        if (Object.keys(options).length !== 1 || !('gameId' in options)) throw new ServerError(400, 'INVALID_PAYLOAD')
        try { resolveGame(options.gameId, config.registry ?? gameRegistry) } catch { throw new ServerError(400, 'UNKNOWN_GAME') }
      } else {
        if (Object.keys(options).length !== 1 || !('expectedGameId' in options) || typeof options.expectedGameId !== 'string') throw new ServerError(400, 'INVALID_PAYLOAD')
        const code = path.split('/').pop()!
        const lobby = matchMaker.getLocalRoomById(code)
        if (!lobby || lobby.roomName !== 'lobby') throw new ServerError(404, 'LOBBY_NOT_FOUND')
        const gameId = await matchMaker.remoteRoomCall(code, 'getPublicGameId')
        if (gameId !== options.expectedGameId) throw new ServerError(409, 'WRONG_GAME')
      }
      // This field is injected only AFTER strict input validation and verified Auth.
      // Colyseus passes these creation options to onCreate; the browser cannot set it.
      if (creating) Object.assign(options, { _creatorUserId: identity.userId })
      return identity
    }
    state = new LobbyState()
    maxClients = MAX_PLAYERS
    private releaseCreation?: () => void
    private creatorUserId = ''
    private creatorAdmitted = false
    private participants = new Map<string, { identity: AuthenticatedPlayer; cancelExpiry: () => void }>()
    private countdown: ReturnType<typeof setTimeout> | undefined
    private definition!: GameDefinition
    private transitionId: string | undefined
    getPublicGameId() { return this.state.gameId }

    async onCreate(options: { _creatorUserId?: unknown; gameId?: unknown }) {
      if (typeof options._creatorUserId !== 'string' || !options._creatorUserId) throw new ServerError(401, 'AUTH_REQUIRED')
      this.creatorUserId = options._creatorUserId
      this.definition = resolveGame(options.gameId, config.registry ?? gameRegistry)
      this.maxClients = this.definition.maxPlayers
      this.state.gameId = this.definition.id
      this.state.minPlayers = this.definition.minPlayers
      this.state.maxPlayers = this.definition.maxPlayers
      this.roomId = (config.allocateCode ?? allocateLobbyCode)()
      this.state.code = this.roomId
      this.seatReservationTimeout = 10
      this.setPatchRate(50)
      await this.setMatchmaking({ private: true, unlisted: true, locked: true })
      if (config.reserveCreation) {
        this.releaseCreation = config.reserveCreation(this.creatorUserId)
        if (!this.releaseCreation) throw new ServerError(429, 'RATE_LIMIT')
      }
      this.onMessage('set_ready', (client, payload: unknown) => {
        if (config.available?.() === false) return this.reject(client, 'UNAVAILABLE')
        if (!this.isPresent(client)) return this.reject(client, 'NOT_PRESENT')
        if (this.state.status !== 'WAITING') return this.reject(client, 'INVALID_STATE')
        try { this.state.players.get(client.sessionId)!.ready = readReady(payload) }
        catch { this.reject(client, 'INVALID_PAYLOAD') }
      })
      this.onMessage('start_game', (client, payload: unknown) => {
        if (config.available?.() === false) return this.reject(client, 'UNAVAILABLE')
        if (payload !== undefined) return this.reject(client, 'INVALID_PAYLOAD')
        if (!this.isPresent(client)) return this.reject(client, 'NOT_PRESENT')
        if (client.auth?.userId !== this.state.hostUserId) return this.reject(client, 'HOST_REQUIRED')
        if (this.state.status !== 'WAITING') return this.reject(client, 'INVALID_STATE')
        if (!this.canStart()) return this.reject(client, 'NOT_READY')
        this.transition('STARTING')
        const snapshot = [...this.participants].map(([lobbySessionId, participant]) => ({ lobbySessionId, identity: participant.identity }))
        const transitionId = coordinator.begin(this.roomId, this.definition, snapshot, {
          valid: () => this.transitionId === transitionId && ['STARTING', 'PLAYING'].includes(this.state.status)
            && snapshot.length === this.participants.size && snapshot.every(p => this.participants.get(p.lobbySessionId)?.identity === p.identity),
          reservation: (sessionId, message) => {
            const member = this.clients.getById(sessionId)
            if (!member) throw new Error('PARTICIPANT_LEFT')
            member.send('game_reservation', message)
          },
          ready: () => { if (this.transitionId === transitionId && this.state.status === 'STARTING') this.transition('PLAYING') },
          failed: () => {
            if (this.transitionId !== transitionId) return
            this.transitionId = undefined
            if (this.state.status === 'STARTING' || this.state.status === 'PLAYING') this.cancelStart()
            this.broadcast('game_cancelled', { transitionId })
          },
        })
        this.transitionId = transitionId
        void this.lock().then(() => {
          if (this.state.status !== 'STARTING' || this.transitionId !== transitionId) return
          this.countdown = setTimeout(() => {
            this.countdown = undefined
            if (this.state.status !== 'STARTING' || this.transitionId !== transitionId) return
            if (this.canStart()) void coordinator.prepare(transitionId)
            else coordinator.cancel(transitionId)
          }, config.startDelayMs ?? 3000)
        }).catch(() => { if (this.transitionId === transitionId) coordinator.cancel(transitionId) })
      })
    }
    async onJoin(client: LobbyClient) {
      if (config.available?.() === false) throw new ServerError(503, 'UNAVAILABLE')
      if (!client.auth || client.auth.expiresAt <= Date.now()) throw new ServerError(401, 'AUTH_REQUIRED')
      if (this.state.status !== 'WAITING') throw new ServerError(409, 'LOBBY_STARTED')
      if (!this.creatorAdmitted && client.auth.userId !== this.creatorUserId) throw new ServerError(409, 'CREATOR_PENDING')
      if (this.state.players.size >= this.definition.maxPlayers) throw new ServerError(409, 'LOBBY_FULL')
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
      if (this.transitionId) coordinator.participantLeft(this.transitionId)
    }
    onDispose() {
      this.releaseCreation?.()
      if (this.transitionId) coordinator.cancel(this.transitionId, false)
      clearTimeout(this.countdown)
      for (const participant of this.participants.values()) participant.cancelExpiry()
      this.participants.clear()
    }
    onUncaughtException(error: Error) { if (error.cause instanceof ServerError) return; safeLog('room_unexpected_error'); this.closeLobby() }
    private isPresent(client: LobbyClient) {
      if (client.auth && client.auth.expiresAt <= Date.now()) { client.leave(4001); return false }
      return this.state.players.has(client.sessionId) && this.participants.has(client.sessionId)
    }
    private canStart() {
      return rosterCanStart([...this.state.players].map(([id, player]) => ({ ready: player.ready, expiresAt: this.participants.get(id)?.identity.expiresAt ?? 0 })), Date.now(), this.definition)
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
      void this.unlock().catch(() => { safeLog('cleanup_error'); this.closeLobby() })
    }
    private closeLobby() {
      if (this.state.status === 'CLOSED') return
      this.transition('CLOSED')
      if (this.transitionId) coordinator.cancel(this.transitionId, false)
      this.transitionId = undefined
      clearTimeout(this.countdown)
      void this.disconnect().catch(() => safeLog('cleanup_error'))
    }
    private reject(client: LobbyClient, code: string) { client.send('lobby_error', { code }) }
  }
}

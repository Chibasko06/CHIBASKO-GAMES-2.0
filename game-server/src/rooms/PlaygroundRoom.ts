import { Room, ServerError, type Client, type AuthContext } from '@colyseus/core'
import type { Authenticate, AuthenticatedPlayer } from '../auth/supabaseAuth.js'
import { performance } from 'node:perf_hooks'
import { PlayerState, PlaygroundState } from '../schema/PlaygroundState.js'
import { validateMove } from '../validation/move.js'
import { scheduleSessionExpiry } from '../auth/sessionExpiry.js'

export function createPlaygroundRoom(authenticate: Authenticate) {
  return class PlaygroundRoom extends Room<{ state: PlaygroundState; client: Client<{ auth: AuthenticatedPlayer }> }> {
    static async onAuth(token: string | undefined, options: unknown, context: AuthContext): Promise<AuthenticatedPlayer> {
      void context
      try {
        if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length) throw new Error()
        return await authenticate(token)
      } catch { throw new ServerError(401, 'Authentication refused') }
    }
    state = new PlaygroundState()
    maxClients = 16
    private lastAccepted = new Map<string, number>()
    private expiryTimers = new Map<string, () => void>()

    onCreate() {
      this.seatReservationTimeout = 10
      this.setPatchRate(50)
      this.onMessage('move', (client, payload: unknown) => {
        const player = this.state.players.get(client.sessionId)
        if (!player) return
        if (client.auth.expiresAt <= Date.now()) { client.leave(4001); return }
        const now = performance.now()
        const result = validateMove(payload, player, now, this.lastAccepted.get(client.sessionId))
        if (typeof result === 'string') {
          client.send('move_rejected', { code: result })
          return
        }
        player.x = result.x
        player.y = result.y
        this.lastAccepted.set(client.sessionId, now)
      })
    }

    onJoin(client: Client<{ auth: AuthenticatedPlayer }>) {
      if (!client.auth || client.auth.expiresAt <= Date.now()) throw new ServerError(401, 'Authentication refused')
      const player = new PlayerState()
      player.userId = client.auth.userId
      player.username = client.auth.username
      player.avatarUrl = client.auth.avatarUrl ?? ''
      this.state.players.set(client.sessionId, player)
      this.expiryTimers.set(client.sessionId, scheduleSessionExpiry(client.auth.expiresAt, () => client.leave(4001)))
    }

    onLeave(client: Client) {
      this.state.players.delete(client.sessionId)
      this.lastAccepted.delete(client.sessionId)
      this.expiryTimers.get(client.sessionId)?.()
      this.expiryTimers.delete(client.sessionId)
    }
    onDispose() {
      for (const cancel of this.expiryTimers.values()) cancel()
      this.expiryTimers.clear()
    }
  }
}

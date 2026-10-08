import { Room, ServerError } from '@colyseus/core'
import { GameAdmission, type GameClient } from '../../platform/multiplayer/GameAdmission.js'
import type { GameSessionCoordinator } from '../../platform/multiplayer/GameSessionCoordinator.js'
import { PongState, PongPlayer } from './PongState.js'

export function createPongRoom(coordinator: GameSessionCoordinator) {
  return class PongRoom extends Room<{ state: PongState; client: GameClient }> {
    static async onAuth() { throw new ServerError(403, 'PRIVATE_GAME') }
    state = new PongState()
    private transitionId = ''
    private admission!: GameAdmission
    async onCreate(options: { transitionId?: unknown }) {
      if (typeof options.transitionId !== 'string') throw new ServerError(403, 'PRIVATE_GAME')
      const definition = coordinator.definition(options.transitionId)
      if (!definition || definition.roomType !== 'pong') throw new ServerError(403, 'PRIVATE_GAME')
      this.transitionId = options.transitionId
      this.maxClients = definition.maxPlayers
      // A cancelled room may retain unconsumed seats until their Colyseus timers
      // expire. Bound those timers by the transition budget, never a fresh 10s.
      this.seatReservationTimeout = coordinator.reservationSeconds(this.transitionId)
      this.state.gameId = definition.id
      this.state.expectedPlayers = coordinator.expectedPlayers(this.transitionId)
      this.setPatchRate(50)
      this.admission = new GameAdmission(coordinator, this.transitionId, this.roomId)
      await this.setMatchmaking({ private: true, unlisted: true, locked: true })
    }
    onJoin(client: GameClient) {
      const identity = this.admission.join(client)
      const player = new PongPlayer()
      player.userId = identity.userId
      player.username = identity.username
      player.avatarUrl = identity.avatarUrl ?? ''
      this.state.players.set(client.sessionId, player)
    }
    admitted(client: GameClient) { if (client.auth) coordinator.admitted(client.auth, this.roomId, client.sessionId) }
    activate(transitionId: string) {
      if (transitionId !== this.transitionId || !coordinator.canActivate(transitionId, this.roomId)) throw new Error('SESSION_INVALID')
      this.state.status = 'READY'
    }
    onLeave(client: GameClient) { this.state.players.delete(client.sessionId); this.admission?.leave(client) }
    onDispose() { this.admission?.dispose(); coordinator.disposed(this.transitionId, this.roomId) }
    onUncaughtException() { coordinator.disposed(this.transitionId, this.roomId) }
  }
}

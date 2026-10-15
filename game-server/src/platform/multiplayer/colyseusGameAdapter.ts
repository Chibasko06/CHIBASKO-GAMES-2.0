import { Room, ServerError, type Server } from '@colyseus/core'
import type { Schema } from '@colyseus/schema'
import type { GameServerInstance, GameServerModule } from '@chibaskogames/sdk/server'
import type { GameClient } from './GameAdmission.js'
import type { InternalGameAdapter } from './internalGameAdapter.js'

export function registerColyseusGame<State extends Schema>(server: Server, roomType: string, module: GameServerModule<State>, adapter: InternalGameAdapter) {
  class AdaptedGameRoom extends Room<{ state: State; client: GameClient }> {
    static async onAuth() { throw new ServerError(403, 'PRIVATE_GAME') }
    private context!: ReturnType<InternalGameAdapter['createContext']>
    private game!: GameServerInstance<State>
    private metadataClients = new Set<string>()
    async onCreate(options: { transitionId?: unknown }) {
      this.context = adapter.createContext({ transitionId: options.transitionId, roomId: this.roomId, roomType })
      if (this.context.definition.id !== module.definition.id || this.context.definition.integrationVersion !== module.definition.integrationVersion) throw new ServerError(403, 'PRIVATE_GAME')
      this.maxClients = this.context.definition.capabilities.online!.players.max
      this.seatReservationTimeout = this.context.reservationSeconds
      this.game = module.create(this.context.session)
      this.setState(this.game.state)
      this.setPatchRate(module.patchRateMs)
      await this.setMatchmaking({ private: true, unlisted: true, locked: true })
      this.onMessage('__sdk_session', (client, payload) => { if (payload === undefined && !this.metadataClients.has(client.sessionId) && this.context.getPlayer(client)) { this.metadataClients.add(client.sessionId); this.sendSession(client) } })
      this.onMessage('*', (client, type, payload: unknown) => {
        const participant = this.context.getPlayer(client)
        if (participant && typeof type === 'string' && !type.startsWith('__sdk_')) this.game.receive(Object.freeze({ participant,
          reply: (name: string, data?: unknown) => { if (typeof name === 'string' && !name.startsWith('__sdk_')) client.send(name, data) } }), type, payload)
      })
    }
    onJoin(client: GameClient) { this.game.participantJoined(this.context.admit(client)) }
    admitted(client: GameClient) { this.context.admitted(client); this.sendSessions() }
    activate(transitionId: string) {
      this.context.activate(transitionId)
      this.game.start(); this.sendSessions()
      this.setSimulationInterval(delta => { this.game.tick(delta); if (this.context.completed) { this.setSimulationInterval(); this.sendSessions() } }, 1000 / module.tickRate)
    }
    participantLeft(userId: string) {
      const id = this.context.participantId(userId)
      if (id) this.game.participantLeft(id)
      if (this.context.completed) this.setSimulationInterval()
      this.sendSessions()
    }
    onLeave(client: GameClient) {
      this.metadataClients.delete(client.sessionId)
      this.context?.leave(client)
      this.sendSessions()
    }
    onDispose() { this.setSimulationInterval(); this.metadataClients.clear(); this.game?.dispose(); this.context?.dispose() }
    onUncaughtException(error: Error) { if (error.cause instanceof ServerError) return; this.context?.session.fail() }
    private sendSession(client: GameClient) {
      const snapshot = this.context.snapshot(client)
      if (snapshot && this.metadataClients.has(client.sessionId)) client.send('__sdk_session', snapshot)
    }
    private sendSessions() { for (const client of this.clients) this.sendSession(client) }
  }
  server.define(roomType, AdaptedGameRoom).on('join', (room, client) => room.admitted(client))
}

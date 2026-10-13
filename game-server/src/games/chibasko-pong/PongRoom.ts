import { Room, ServerError } from '@colyseus/core'
import type { InternalGamePlatform, InternalGameContext, InternalGameClient as GameClient } from '../sdk/index.js'
import { PongState, PongPlayer } from './PongState.js'
import { PONG, PongSimulation, readInput, type Side } from './simulation.js'

export function createPongRoom(platform: InternalGamePlatform) {
  return class PongRoom extends Room<{ state: PongState; client: GameClient }> {
    static async onAuth() { throw new ServerError(403, 'PRIVATE_GAME') }
    state = new PongState()
    private platform!: InternalGameContext
    private simulation = new PongSimulation(this.state)
    private accumulator = 0
    private stopped = false
    private quotas = new Map<string, { count: number; until: number }>()
    private roster: { userId: string; side: Side }[] = []
    async onCreate(options: { transitionId?: unknown }) {
      this.platform = platform.createContext({ transitionId: options.transitionId, roomId: this.roomId, roomType: 'pong' })
      const definition = this.platform.definition
      this.maxClients = definition.maxPlayers
      // A cancelled room may retain unconsumed seats until their Colyseus timers
      // expire. Bound those timers by the transition budget, never a fresh 10s.
      this.seatReservationTimeout = this.platform.reservationSeconds
      this.state.gameId = definition.id
      this.state.expectedPlayers = this.platform.expectedPlayers
      if (this.state.expectedPlayers !== 2) throw new ServerError(400, 'INVALID_ROSTER')
      this.setPatchRate(50)
      await this.setMatchmaking({ private: true, unlisted: true, locked: true })
      this.onMessage('set_input', (client, payload: unknown) => {
        const player = this.state.players.get(client.sessionId)
        if (!player || !this.platform.getPlayer(client) || this.state.phase === 'FINISHED') return
        const now = Date.now(), quota = this.quotas.get(client.sessionId) ?? { count: 0, until: now + 1000 }
        if (now >= quota.until) { quota.count = 0; quota.until = now + 1000 }
        this.quotas.set(client.sessionId, quota)
        if (++quota.count > 60) { client.send('game_error', { code: 'RATE_LIMIT' }); return }
        try { this.simulation.setInput(player.side as Side, readInput(payload)) }
        catch { client.send('game_error', { code: 'INVALID_INPUT' }) }
      })
    }
    onJoin(client: GameClient) {
      const identity = this.platform.admit(client)
      const player = new PongPlayer()
      player.userId = identity.userId
      player.username = identity.username
      player.avatarUrl = identity.avatarUrl ?? ''
      player.side = this.roster.length === 0 ? 'LEFT' : 'RIGHT'
      this.roster.push({ userId: identity.userId, side: player.side as Side })
      this.state.players.set(client.sessionId, player)
    }
    admitted(client: GameClient) { this.platform.admitted(client) }
    activate(transitionId: string) {
      this.platform.assertCanActivate(transitionId)
      this.state.status = 'READY'
      this.simulation.start()
      this.setSimulationInterval(delta => {
        if (this.stopped) return
        this.accumulator += Math.min(delta, 250)
        const step = 1000 / PONG.tickRate
        while (this.accumulator >= step && !this.stopped) {
          this.simulation.step(step); this.accumulator -= step
          if (this.state.phase === 'FINISHED') this.finish('score')
        }
      }, 1000 / PONG.tickRate)
    }
    participantLeft(userId: string) {
      const player = this.roster.find(p => p.userId === userId)
      if (player && this.simulation.forfeit(player.side)) this.finish('forfeit')
    }
    private finish(reason: 'score' | 'forfeit') {
      if (this.stopped) return
      this.stopped = true; this.setSimulationInterval(); this.simulation.clearInputs(); this.quotas.clear()
      const winner = this.roster.find(p => p.side === this.state.winnerSide)
      if (!winner) return
      this.platform.complete({ gameId: this.state.gameId, winnerUserId: winner.userId, reason,
        players: this.roster.map(p => ({ userId: p.userId, score: p.side === 'LEFT' ? this.state.leftScore : this.state.rightScore })) })
    }
    onLeave(client: GameClient) { this.state.players.delete(client.sessionId); this.quotas.delete(client.sessionId); this.platform?.leave(client) }
    onDispose() { this.stopped = true; this.setSimulationInterval(); this.simulation.clearInputs(); this.quotas.clear(); this.platform?.dispose() }
    onUncaughtException(error: Error) { if (error.cause instanceof ServerError) return; this.platform?.fail() }
  }
}

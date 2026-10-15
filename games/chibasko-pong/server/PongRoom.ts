import type { GameParticipant } from '@chibaskogames/sdk'
import type { GameServerModule } from '@chibaskogames/sdk/server'
import { pongDefinition } from '../definition.js'
import { PongState, PongPlayer } from './PongState.js'
import { PONG, PongSimulation, createPongStepper, readInput, type Side } from '../shared/simulation.js'

// Gameplay driver. The platform adapter owns Room, admission and activation.
export const pongServerModule: GameServerModule<PongState> = {
  definition: pongDefinition, tickRate: PONG.tickRate, patchRateMs: 50,
  create(platform) {
    const state = new PongState()
    state.gameId = platform.session.gameId
    state.expectedPlayers = platform.participants.length
    if (state.expectedPlayers !== 2) throw new Error('INVALID_ROSTER')
    const simulation = new PongSimulation(state)
    const advance = createPongStepper(simulation)
    const quotas = new Map<string, { count: number; until: number }>()
    const roster: { participantId: string; side: Side }[] = []
    let stopped = false
    function finish(reason: 'score' | 'forfeit') {
      if (stopped) return
      stopped = true; simulation.clearInputs(); quotas.clear()
      const winner = roster.find(p => p.side === state.winnerSide)
      if (!winner) return
      platform.complete({ gameId: state.gameId, winnerParticipantId: winner.participantId, reason,
        players: roster.map(p => ({ participantId: p.participantId, score: p.side === 'LEFT' ? state.leftScore : state.rightScore })) })
    }
    return {
      state,
      participantJoined(identity: GameParticipant) {
        const player = new PongPlayer()
        player.participantId = identity.participantId
        player.username = identity.username; player.avatarUrl = identity.avatarUrl ?? ''
        player.side = roster.length === 0 ? 'LEFT' : 'RIGHT'
        roster.push({ participantId: identity.participantId, side: player.side as Side })
        state.players.set(identity.participantId, player)
      },
      receive(peer, type, payload) {
        if (type !== 'set_input') return
        const id = peer.participant.participantId, player = state.players.get(id)
        if (!player || !platform.isParticipantActive(id) || state.phase === 'FINISHED') return
        const now = Date.now(), quota = quotas.get(id) ?? { count: 0, until: now + 1000 }
        if (now >= quota.until) { quota.count = 0; quota.until = now + 1000 }
        quotas.set(id, quota)
        if (++quota.count > 60) { peer.reply('game_error', { code: 'RATE_LIMIT' }); return }
        try { simulation.setInput(player.side as Side, readInput(payload)) }
        catch { peer.reply('game_error', { code: 'INVALID_INPUT' }) }
      },
      start() { state.status = 'READY'; simulation.start() },
      tick(delta) {
        if (stopped) return
        advance(delta)
        if (state.phase === 'FINISHED') finish('score')
      },
      participantLeft(id) {
        const player = roster.find(p => p.participantId === id)
        if (player && simulation.forfeit(player.side)) finish('forfeit')
        state.players.delete(id); quotas.delete(id)
      },
      dispose() { stopped = true; simulation.clearInputs(); quotas.clear() },
    }
  },
}

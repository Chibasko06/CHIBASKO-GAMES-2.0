import { randomUUID } from 'node:crypto'
import { ServerError } from '@colyseus/core'
import { INTEGRATION_VERSION, type GameParticipant, type GameResult, type GameSessionSnapshot } from '@chibaskogames/sdk'
import type { GameServerSession } from '@chibaskogames/sdk/server'
import { GameAdmission, type GameClient } from './GameAdmission.js'
import type { GameIdentity, GameSessionCoordinator } from './GameSessionCoordinator.js'
import { safeLog } from '../../runtime/logging.js'

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function validResult(value: unknown): value is GameResult {
  return record(value) && Object.keys(value).every(k => ['gameId', 'winnerParticipantId', 'reason', 'players'].includes(k))
    && typeof value.gameId === 'string' && (value.winnerParticipantId === null || typeof value.winnerParticipantId === 'string')
    && typeof value.reason === 'string' && Array.isArray(value.players)
    && value.players.every(p => record(p) && Object.keys(p).every(k => ['participantId', 'score'].includes(k))
      && typeof p.participantId === 'string' && (p.score === undefined || (typeof p.score === 'number' && Number.isFinite(p.score))))
}
// Private adapter: auth snapshots, reservations and transport identifiers never
// cross into the SDK session provided to gameplay.
export function createInternalGameAdapter(coordinator: GameSessionCoordinator) {
  return Object.freeze({
    createContext({ transitionId, roomId, roomType }: { transitionId: unknown; roomId: string; roomType: string }) {
      const registration = typeof transitionId === 'string' ? coordinator.definition(transitionId) : undefined
      if (typeof transitionId !== 'string' || !registration || registration.roomType !== roomType) throw new ServerError(403, 'PRIVATE_GAME')
      const admission = new GameAdmission(coordinator, transitionId, roomId)
      const roster = coordinator.participants(transitionId).map(p => ({
        userId: p.identity.userId,
        participant: Object.freeze({ participantId: randomUUID(), username: p.identity.username, avatarUrl: p.identity.avatarUrl }),
      }))
      const descriptor = Object.freeze({ id: randomUUID(), gameId: registration.id, integrationVersion: INTEGRATION_VERSION, execution: 'online' as const })
      const participants = Object.freeze(roster.map(p => p.participant))
      const members = new Map<string, { client: GameClient; player: GameParticipant; auth: GameIdentity }>()
      let active = true, completed = false, ready = false
      const available = () => active && !completed && coordinator.definition(transitionId) === registration
      const getPlayer = (client: GameClient) => {
        const member = members.get(client.sessionId)
        return available() && member?.client === client && member.auth.identity.expiresAt > Date.now() ? member.player : null
      }
      const dispose = () => {
        if (!active) return
        active = false; admission.dispose(); members.clear(); coordinator.disposed(transitionId, roomId)
      }
      const session: GameServerSession = Object.freeze({
        session: descriptor, participants,
        isParticipantActive(id: string) { return [...members.values()].some(m => m.player.participantId === id && getPlayer(m.client) !== null) },
        complete(result: GameResult) {
          if (!available() || !validResult(result)) return false
          const lookup = (id: string) => roster.find(p => p.participant.participantId === id)?.userId
          if (result.players.some(p => !lookup(p.participantId)) || (result.winnerParticipantId !== null && !lookup(result.winnerParticipantId))) return false
          const accepted = coordinator.completed(transitionId, roomId, {
            gameId: result.gameId, winnerUserId: result.winnerParticipantId === null ? null : lookup(result.winnerParticipantId)!,
            reason: result.reason, players: result.players.map(p => ({ userId: lookup(p.participantId)!, ...(p.score === undefined ? {} : { score: p.score }) })),
          })
          if (accepted) completed = true
          return accepted
        },
        fail() { if (active) { safeLog('room_unexpected_error'); dispose() } },
      })
      return Object.freeze({
        get completed() { return completed },
        session, definition: registration.definition, expectedPlayers: participants.length,
        reservationSeconds: coordinator.reservationSeconds(transitionId),
        admit(client: GameClient) {
          if (!available() || members.has(client.sessionId) || !client.auth) throw new ServerError(401, 'ADMISSION_REFUSED')
          const identity = admission.join(client)
          const player = roster.find(p => p.userId === identity.userId)!.participant
          const auth = Object.freeze({ ...client.auth, identity: Object.freeze({ ...identity }) })
          members.set(client.sessionId, { client, player, auth })
          return player
        },
        getPlayer,
        admitted(client: GameClient) {
          const member = members.get(client.sessionId)
          if (member && getPlayer(client)) coordinator.admitted(member.auth, roomId, client.sessionId)
        },
        activate(id: string) {
          if (!available() || id !== transitionId || !coordinator.canActivate(transitionId, roomId)) throw new Error('SESSION_INVALID')
          ready = true
        },
        participantId(userId: string) { return roster.find(p => p.userId === userId)?.participant.participantId },
        snapshot(client: GameClient): GameSessionSnapshot | null {
          const member = members.get(client.sessionId)
          if (!active || !member || member.client !== client) return null
          return Object.freeze({ session: descriptor, participants,
            localParticipantIds: Object.freeze([member.player.participantId]),
            connectedParticipantIds: Object.freeze([...members.values()].map(m => m.player.participantId)),
            availability: completed ? 'completed' : ready ? 'ready' : 'preparing' })
        },
        leave(client: GameClient) {
          if (members.get(client.sessionId)?.client !== client) return
          members.delete(client.sessionId); admission.leave(client)
        },
        dispose,
      })
    },
  })
}
export type InternalGameAdapter = ReturnType<typeof createInternalGameAdapter>

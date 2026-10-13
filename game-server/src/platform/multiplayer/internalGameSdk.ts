import { ServerError } from '@colyseus/core'
import { GameAdmission, type GameClient } from './GameAdmission.js'
import type { GameIdentity, GameSessionCoordinator } from './GameSessionCoordinator.js'
import type { InternalGamePlatform, InternalGameClient, PublicGamePlayer, GameResult } from '../../games/sdk/index.js'
import { safeLog } from '../../runtime/logging.js'

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function validResult(value: unknown): value is GameResult {
  return record(value) && Object.keys(value).every(k => ['gameId', 'winnerUserId', 'reason', 'players'].includes(k))
    && typeof value.gameId === 'string' && (value.winnerUserId === null || typeof value.winnerUserId === 'string')
    && typeof value.reason === 'string' && Array.isArray(value.players)
    && value.players.every(p => record(p) && Object.keys(p).every(k => ['userId', 'score'].includes(k))
      && typeof p.userId === 'string' && (p.score === undefined || (typeof p.score === 'number' && Number.isFinite(p.score))))
}

// The only adapter that knows admission/coordinator internals. No authentication
// is repeated here; public capabilities are derived from already verified seats.
export function createInternalGamePlatform(coordinator: GameSessionCoordinator): InternalGamePlatform {
  return Object.freeze({
    createContext({ transitionId, roomId, roomType }) {
      const definition = typeof transitionId === 'string' ? coordinator.definition(transitionId) : undefined
      if (typeof transitionId !== 'string' || !definition || definition.roomType !== roomType) throw new ServerError(403, 'PRIVATE_GAME')
      const admission = new GameAdmission(coordinator, transitionId, roomId)
      const members = new Map<string, { client: InternalGameClient; player: PublicGamePlayer; auth: GameIdentity }>()
      let active = true, completed = false
      const available = () => active && !completed && coordinator.definition(transitionId) === definition
      const getPlayer = (client: InternalGameClient) => {
        const member = members.get(client.sessionId)
        return available() && member?.client === client && member.auth.identity.expiresAt > Date.now() ? member.player : null
      }
      const dispose = () => {
        if (!active) return
        active = false
        admission.dispose(); members.clear()
        coordinator.disposed(transitionId, roomId)
      }
      return Object.freeze({
        definition: Object.freeze({ ...definition }),
        expectedPlayers: coordinator.expectedPlayers(transitionId),
        reservationSeconds: coordinator.reservationSeconds(transitionId),
        admit(client: InternalGameClient) {
          if (!available() || members.has(client.sessionId)) throw new ServerError(401, 'ADMISSION_REFUSED')
          // The cast stays inside the platform adapter; GameAdmission validates
          // auth against the snapshot, room and reserved seat before using it.
          const verified = client as GameClient
          if (!verified.auth) throw new ServerError(401, 'ADMISSION_REFUSED')
          const identity = admission.join(verified)
          const player = Object.freeze({ userId: identity.userId, username: identity.username, avatarUrl: identity.avatarUrl })
          const auth = Object.freeze({ ...verified.auth, identity: Object.freeze({ ...identity }) })
          members.set(client.sessionId, { client, player, auth })
          return player
        },
        getPlayer,
        admitted(client: InternalGameClient) {
          const member = members.get(client.sessionId)
          if (member && getPlayer(client)) coordinator.admitted(member.auth, roomId, client.sessionId)
        },
        assertCanActivate(id: string) {
          if (!available() || id !== transitionId || !coordinator.canActivate(transitionId, roomId)) throw new Error('SESSION_INVALID')
        },
        complete(result: GameResult) {
          if (!available() || !validResult(result)) return false
          const accepted = coordinator.completed(transitionId, roomId, result)
          if (accepted) completed = true
          return accepted
        },
        leave(client: InternalGameClient) {
          if (members.get(client.sessionId)?.client !== client) return
          members.delete(client.sessionId)
          admission.leave(client as GameClient)
        },
        fail() { if (active) { safeLog('room_unexpected_error'); dispose() } },
        dispose,
      })
    },
  })
}

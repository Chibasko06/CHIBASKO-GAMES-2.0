import { ServerError, type Client } from '@colyseus/core'
import { scheduleSessionExpiry } from '../../auth/sessionExpiry.js'
import type { GameIdentity, GameSessionCoordinator } from './GameSessionCoordinator.js'

export type GameClient = Client<{ auth: GameIdentity }>
export class GameAdmission {
  private members = new Map<string, { userId: string; cancel: () => void }>()
  constructor(private coordinator: GameSessionCoordinator, private transitionId: string, private roomId: string) {}
  join(client: GameClient) {
    const auth = client.auth
    if (!auth || auth.transitionId !== this.transitionId || !this.coordinator.authorize(auth, this.roomId, client.sessionId)
      || [...this.members.values()].some(p => p.userId === auth.identity.userId)) throw new ServerError(401, 'ADMISSION_REFUSED')
    this.members.set(client.sessionId, {
      userId: auth.identity.userId,
      cancel: scheduleSessionExpiry(auth.identity.expiresAt, () => client.leave(4001)),
    })
    return auth.identity
  }
  leave(client: GameClient) {
    const member = this.members.get(client.sessionId)
    if (!member) return false
    member.cancel(); this.members.delete(client.sessionId)
    this.coordinator.participantLeft(this.transitionId)
    return true
  }
  dispose() { for (const member of this.members.values()) member.cancel(); this.members.clear() }
}

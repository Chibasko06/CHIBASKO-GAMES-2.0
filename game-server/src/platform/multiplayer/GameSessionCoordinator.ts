import { randomUUID } from 'node:crypto'
import { matchMaker } from '@colyseus/core'
import type { AuthenticatedPlayer } from '../../auth/supabaseAuth.js'
import type { GameDefinition } from '../../games/types.js'

export type GameIdentity = Readonly<{ transitionId: string; lobbySessionId: string; identity: AuthenticatedPlayer }>
export type Reservation = Awaited<ReturnType<typeof matchMaker.reserveSeatFor>>
type IRoomCache = Awaited<ReturnType<typeof matchMaker.createRoom>>
export type Participant = Readonly<{ lobbySessionId: string; identity: AuthenticatedPlayer }>
export type SessionEvents = {
  valid: () => boolean
  reservation: (lobbySessionId: string, message: { transitionId: string; gameId: string; reservation: Reservation }) => void
  ready: () => void
  failed: () => void
}
export interface GameBackend {
  create: (definition: GameDefinition, transitionId: string) => Promise<IRoomCache>
  reserve: (room: IRoomCache, auth: GameIdentity) => Promise<Reservation>
  activate: (roomId: string, transitionId: string) => Promise<unknown>
  destroy: (roomId: string) => Promise<unknown>
}
const backend: GameBackend = {
  create: (game, transitionId) => matchMaker.createRoom(game.roomType, { transitionId }),
  reserve: (room, auth) => matchMaker.reserveSeatFor(room, {}, auth),
  activate: (roomId, transitionId) => matchMaker.remoteRoomCall(roomId, 'activate', [transitionId]),
  destroy: async roomId => { await matchMaker.getLocalRoomById(roomId)?.disconnect() },
}
type Session = {
  id: string; lobbyId: string; definition: GameDefinition; participants: readonly Participant[]; events: SessionEvents
  phase: 'countdown' | 'preparing' | 'admitting' | 'activating' | 'playing'
  deadline: number; timer?: ReturnType<typeof setTimeout>; room?: IRoomCache
  seats: Map<string, string>; admitted: Set<string>
}
// All Colyseus access is behind GameBackend. State is process-local in this phase.
export class GameSessionCoordinator {
  private sessions = new Map<string, Session>()
  private byLobby = new Map<string, string>()
  private backend: GameBackend
  constructor(private timeoutMs = 10000, overrides: Partial<GameBackend> = {}) { this.backend = { ...backend, ...overrides } }
  begin(lobbyId: string, definition: GameDefinition, participants: readonly Participant[], events: SessionEvents) {
    if (this.byLobby.has(lobbyId)) throw new Error('SESSION_EXISTS')
    const id = randomUUID()
    const snapshot = participants.map(p => Object.freeze({ lobbySessionId: p.lobbySessionId, identity: Object.freeze({ ...p.identity }) }))
    if (snapshot.length < definition.minPlayers || snapshot.length > definition.maxPlayers
      || new Set(snapshot.map(p => p.lobbySessionId)).size !== snapshot.length) throw new Error('INVALID_ROSTER')
    if (new Set(snapshot.map(p => p.identity.userId)).size !== snapshot.length) throw new Error('DUPLICATE_USER')
    this.sessions.set(id, { id, lobbyId, definition, participants: snapshot, events, phase: 'countdown', deadline: 0, seats: new Map(), admitted: new Set() })
    this.byLobby.set(lobbyId, id)
    return id
  }
  private valid(session: Session) {
    return this.sessions.get(session.id) === session && session.events.valid()
      && session.participants.every(p => p.identity.expiresAt > Date.now())
      && (session.phase === 'playing' || !session.deadline || Date.now() < session.deadline)
  }
  async prepare(id: string) {
    const session = this.sessions.get(id)
    if (!session || session.phase !== 'countdown') return
    session.phase = 'preparing'
    session.deadline = Date.now() + this.timeoutMs
    session.timer = setTimeout(() => this.cancel(id), this.timeoutMs)
    try {
      if (!this.valid(session)) throw new Error('SESSION_INVALID')
      const room = await this.backend.create(session.definition, id)
      if (!this.valid(session)) { await this.backend.destroy(room.roomId); this.cancel(id); return }
      session.room = room
      const reservations: { participant: Participant; reservation: Reservation }[] = []
      for (const participant of session.participants) {
        const reservation = await this.backend.reserve(room, { transitionId: id, ...participant })
        if (!this.valid(session)) { this.cancel(id); return }
        session.seats.set(participant.identity.userId, reservation.sessionId)
        reservations.push({ participant, reservation })
      }
      session.phase = 'admitting'
      // Publish only after every seat exists; each message goes to one lobby client.
      for (const { participant, reservation } of reservations) {
        session.events.reservation(participant.lobbySessionId, { transitionId: id, gameId: session.definition.id, reservation })
      }
    } catch { this.cancel(id) }
  }
  definition(id: string) { return this.sessions.get(id)?.definition }
  expectedPlayers(id: string) { return this.sessions.get(id)?.participants.length ?? 0 }
  reservationSeconds(id: string) {
    const session = this.sessions.get(id)
    return session ? Math.max(0.001, (session.deadline - Date.now()) / 1000) : 0.001
  }
  authorize(auth: GameIdentity | undefined, roomId: string, gameSessionId: string) {
    if (!auth?.identity) return false
    const session = this.sessions.get(auth.transitionId)
    return !!session && session.phase === 'admitting' && this.valid(session) && session.room?.roomId === roomId
      && session.seats.get(auth.identity.userId) === gameSessionId
      && session.participants.some(p => p.lobbySessionId === auth.lobbySessionId && p.identity.userId === auth.identity.userId
        && p.identity.username === auth.identity.username && p.identity.avatarUrl === auth.identity.avatarUrl
        && p.identity.expiresAt === auth.identity.expiresAt)
  }
  admitted(auth: GameIdentity, roomId: string, gameSessionId: string) {
    if (!this.authorize(auth, roomId, gameSessionId)) return
    const session = this.sessions.get(auth.transitionId)!
    session.admitted.add(auth.identity.userId)
    if (session.admitted.size !== session.participants.length) return
    session.phase = 'activating'
    void this.backend.activate(roomId, session.id).then(() => {
      if (!this.valid(session) || session.phase !== 'activating') { this.cancel(session.id); return }
      session.phase = 'playing'
      clearTimeout(session.timer)
      session.events.ready()
    }).catch(() => this.cancel(session.id))
  }
  canActivate(id: string, roomId: string) {
    const session = this.sessions.get(id)
    return !!session && session.phase === 'activating' && session.room?.roomId === roomId && this.valid(session)
      && session.admitted.size === session.participants.length
  }
  participantLeft(id: string) { this.cancel(id) } // Prototype policy, replaceable independently of LobbyRoom.
  disposed(id: string, roomId: string) {
    if (this.sessions.get(id)?.room?.roomId === roomId) this.cancel(id)
  }
  cancel(id: string, notify = true) {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    this.byLobby.delete(session.lobbyId)
    clearTimeout(session.timer)
    if (session.room) void this.backend.destroy(session.room.roomId).catch(() => {})
    if (notify) session.events.failed()
  }
  // Future completed(result) belongs here; no client-supplied results are accepted.
}

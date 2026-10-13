import { safeLog } from '../../runtime/logging.js'
import { randomUUID } from 'node:crypto'
import { matchMaker } from '@colyseus/core'
import type { AuthenticatedPlayer } from '../../auth/supabaseAuth.js'
import type { GameDefinition } from '../../games/types.js'
import type { GameResult } from './GameResult.js'

export type GameIdentity = Readonly<{ transitionId: string; lobbySessionId: string; identity: AuthenticatedPlayer }>
export type Reservation = Awaited<ReturnType<typeof matchMaker.reserveSeatFor>>
type IRoomCache = Awaited<ReturnType<typeof matchMaker.createRoom>>
export type Participant = Readonly<{ lobbySessionId: string; identity: AuthenticatedPlayer }>
export type SessionEvents = {
  valid: () => boolean
  reservation: (lobbySessionId: string, message: { transitionId: string; gameId: string; reservation: Reservation }) => void
  ready: () => void
  failed: () => void
  completed?: (result: GameResult) => void
}
export interface GameBackend {
  create: (definition: GameDefinition, transitionId: string) => Promise<IRoomCache>
  reserve: (room: IRoomCache, auth: GameIdentity) => Promise<Reservation>
  activate: (roomId: string, transitionId: string) => Promise<unknown>
  destroy: (roomId: string) => Promise<unknown>
  depart?: (roomId: string, userId: string) => Promise<unknown>
}
const backend: GameBackend = {
  create: (game, transitionId) => matchMaker.createRoom(game.roomType, { transitionId }),
  reserve: (room, auth) => matchMaker.reserveSeatFor(room, {}, auth),
  activate: (roomId, transitionId) => matchMaker.remoteRoomCall(roomId, 'activate', [transitionId]),
  destroy: async roomId => { await matchMaker.getLocalRoomById(roomId)?.disconnect() },
  depart: (roomId, userId) => matchMaker.remoteRoomCall(roomId, 'participantLeft', [userId]),
}
type Session = {
  id: string; lobbyId: string; definition: GameDefinition; participants: readonly Participant[]; events: SessionEvents
  phase: 'countdown' | 'preparing' | 'admitting' | 'activating' | 'playing' | 'completed'
  deadline: number; timer?: ReturnType<typeof setTimeout>; room?: IRoomCache
  seats: Map<string, string>; admitted: Set<string>
}
// All Colyseus access is behind GameBackend. State is process-local in this phase.
export class GameSessionCoordinator {
  private operations = new Set<Promise<void>>()
  private closing = false
  private cleanups = new Set<Promise<unknown>>()
  private cleanupFailed = false
  private sessions = new Map<string, Session>()
  private byLobby = new Map<string, string>()
  private backend: GameBackend
  constructor(private timeoutMs = 10000, overrides: Partial<GameBackend> = {}, private available: () => boolean = () => true) { this.backend = { ...backend, ...overrides } }
  begin(lobbyId: string, definition: GameDefinition, participants: readonly Participant[], events: SessionEvents) {
    if (this.closing || !this.available()) throw new Error('UNAVAILABLE')
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
    return !this.closing && this.available() && this.sessions.get(session.id) === session && session.events.valid()
      && session.participants.every(p => p.identity.expiresAt > Date.now())
      && (session.phase === 'playing' || !session.deadline || Date.now() < session.deadline)
  }
  prepare(id: string) {
    const task = this.prepareSession(id)
    this.operations.add(task)
    void task.then(() => this.operations.delete(task), () => this.operations.delete(task))
    return task
  }
  private async prepareSession(id: string) {
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
    } catch (error) { if (!(error instanceof Error && error.message === 'SESSION_INVALID')) safeLog('coordinator_error'); this.cancel(id) }
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
    const activation = this.backend.activate(roomId, session.id).then(() => {
      if (!this.valid(session) || session.phase !== 'activating') { this.cancel(session.id); return }
      session.phase = 'playing'
      clearTimeout(session.timer)
      session.events.ready()
    }).catch(() => { safeLog('coordinator_error'); this.cancel(session.id) })
    this.operations.add(activation)
    void activation.then(() => this.operations.delete(activation), () => this.operations.delete(activation))
  }
  canActivate(id: string, roomId: string) {
    const session = this.sessions.get(id)
    return !!session && session.phase === 'activating' && session.room?.roomId === roomId && this.valid(session)
      && session.admitted.size === session.participants.length
  }
  participantLeft(id: string, userId?: string) {
    const session = this.sessions.get(id)
    if (!session || session.phase === 'completed') return
    if (session.phase === 'playing' && userId && session.room && this.backend.depart) {
      void this.backend.depart(session.room.roomId, userId).catch(() => { safeLog('coordinator_error'); this.cancel(id) })
    } else this.cancel(id)
  }
  completed(id: string, roomId: string, result: GameResult) {
    const session = this.sessions.get(id)
    if (!session || session.phase !== 'playing' || session.room?.roomId !== roomId || this.closing || !this.available()) return false
    const ids = new Set(session.participants.map(p => p.identity.userId))
    if (result.gameId !== session.definition.id || (result.winnerUserId !== null && !ids.has(result.winnerUserId))
      || !/^[a-z][a-z0-9_]{0,31}$/.test(result.reason) || result.players.length !== ids.size
      || new Set(result.players.map(p => p.userId)).size !== ids.size
      || result.players.some(p => !ids.has(p.userId) || (p.score !== undefined && !Number.isFinite(p.score)))) return false
    session.phase = 'completed'; clearTimeout(session.timer)
    const copy = Object.freeze({ gameId: result.gameId, winnerUserId: result.winnerUserId, reason: result.reason,
      players: Object.freeze(result.players.map(p => Object.freeze({ userId: p.userId, ...(p.score !== undefined ? { score: p.score } : {}) }))) })
    session.events.completed?.(copy)
    return true
  }
  disposed(id: string, roomId: string) {
    const session = this.sessions.get(id)
    if (session?.room?.roomId === roomId && session.phase !== 'completed') this.cancel(id)
  }
  cancel(id: string, notify = true) {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    this.byLobby.delete(session.lobbyId)
    clearTimeout(session.timer)
    if (session.room) this.destroy(session.room.roomId)
    if (notify) session.events.failed()
  }
  async reset(id: string) {
    this.cancel(id, false)
    await Promise.all([...this.cleanups])
    if (this.cleanupFailed) throw new Error('CLEANUP_FAILED')
  }
  private destroy(roomId: string) {
    const task = (async () => {
      try { await this.backend.destroy(roomId) }
      catch { this.cleanupFailed = true; safeLog('cleanup_error') }
    })()
    this.cleanups.add(task)
    void task.finally(() => this.cleanups.delete(task))
  }
  async shutdown() {
    this.closing = true
    for (const id of [...this.sessions.keys()]) this.cancel(id, false)
    while (this.operations.size || this.cleanups.size) await Promise.all([...this.operations, ...this.cleanups])
    if (this.cleanupFailed) throw new Error('CLEANUP_FAILED')
  }
  // Completion is called by the server GameRoom only, never a client message.
}

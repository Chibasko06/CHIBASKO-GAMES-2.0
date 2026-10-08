import test from 'node:test'
import assert from 'node:assert/strict'
import { GameSessionCoordinator, type GameBackend } from '../src/platform/multiplayer/GameSessionCoordinator.js'
import { resolveGame } from '../src/games/registry.js'

const participants = () => ['A', 'B'].map(id => ({ lobbySessionId: `lobby-${id}`, identity: { userId: id, username: id, avatarUrl: null, expiresAt: Date.now() + 60000 } }))
const fakeRoom = { roomId: 'room' } as Awaited<ReturnType<GameBackend['create']>>
function fixture(overrides: Partial<GameBackend> = {}, timeout = 1000) {
  const counts = { created: 0, destroyed: 0, failed: 0, ready: 0, published: 0 }
  const coordinator = new GameSessionCoordinator(timeout, {
    create: async () => { counts.created++; return fakeRoom },
    reserve: async (_room, auth) => ({ name: 'pong', roomId: 'room', processId: 'process', sessionId: `seat-${auth.identity.userId}` }),
    activate: async () => {}, destroy: async () => { counts.destroyed++ }, ...overrides,
  })
  const people = participants()
  const events = { valid: () => true, reservation: () => { counts.published++ }, ready: () => { counts.ready++ }, failed: () => { counts.failed++ } }
  const id = coordinator.begin('lobby', resolveGame('chibasko-pong'), people, events)
  return { coordinator, counts, id, people, events }
}
test('coordinator creates once, snapshots identities, validates seats and waits for real admissions', async () => {
  const f = fixture()
  await Promise.all([f.coordinator.prepare(f.id), f.coordinator.prepare(f.id)])
  assert.equal(f.counts.created, 1)
  assert.equal(f.counts.published, 2)
  assert.throws(() => f.coordinator.begin('lobby', resolveGame('chibasko-pong'), [], f.events))
  const auth = (index: number) => ({ transitionId: f.id, ...f.people[index]! })
  assert.equal(f.coordinator.authorize({ ...auth(0), identity: { ...auth(0).identity, userId: 'outsider' } }, 'room', 'seat-A'), false)
  assert.equal(f.coordinator.authorize(auth(0), 'other-room', 'seat-A'), false)
  assert.equal(f.coordinator.authorize(auth(0), 'room', 'seat-B'), false)
  assert.equal(f.coordinator.authorize({ ...auth(0), identity: { ...auth(0).identity, username: 'fake' } }, 'room', 'seat-A'), false)
  f.coordinator.admitted(auth(0), 'room', 'seat-A')
  assert.equal(f.counts.ready, 0)
  f.coordinator.admitted(auth(1), 'room', 'seat-B')
  await Promise.resolve()
  assert.equal(f.counts.ready, 1)
  f.coordinator.participantLeft(f.id)
  assert.equal(f.counts.failed, 1)
  assert.equal(f.counts.destroyed, 1)
  assert.equal(f.coordinator.authorize(auth(0), 'room', 'seat-A'), false)
})
test('creation failures and partial reservations cancel without publishing tickets', async () => {
  for (const mode of ['create', 'reserve']) {
    let reserved = 0
    const f = fixture(mode === 'create' ? { create: async () => { throw new Error('simulated') } } : {
      reserve: async () => { if (++reserved === 2) throw new Error('simulated'); return { name: 'pong', roomId: 'room', processId: 'process', sessionId: 'seat-A' } },
    })
    await f.coordinator.prepare(f.id)
    assert.equal(f.counts.failed, 1)
    assert.equal(f.counts.published, 0)
    assert.equal(f.counts.destroyed, mode === 'reserve' ? 1 : 0)
  }
})
test('cancelled asynchronous creation is cleaned and cannot affect a later attempt', async () => {
  let complete!: (room: typeof fakeRoom) => void
  const f = fixture({ create: () => new Promise(resolve => { complete = resolve }) })
  const pending = f.coordinator.prepare(f.id)
  f.coordinator.cancel(f.id)
  const nextId = f.coordinator.begin('lobby', resolveGame('chibasko-pong'), f.people, f.events)
  complete(fakeRoom)
  await pending
  assert.equal(f.counts.destroyed, 1)
  assert.equal(f.counts.failed, 1)
  assert.equal(f.counts.published, 0)
  assert.ok(f.coordinator.definition(nextId))
  f.coordinator.cancel(nextId, false)
})
test('global deadline cancels a partial admission and expires all outstanding seats', async () => {
  const f = fixture({}, 30)
  await f.coordinator.prepare(f.id)
  const auth = { transitionId: f.id, ...f.people[0]! }
  f.coordinator.admitted(auth, 'room', 'seat-A')
  await new Promise(resolve => setTimeout(resolve, 60))
  assert.equal(f.counts.ready, 0)
  assert.equal(f.counts.failed, 1)
  assert.equal(f.coordinator.authorize(auth, 'room', 'seat-A'), false)
})
test('expired identity, invalid roster, lost lobby session and disposed GameRoom fail closed', async () => {
  const f = fixture()
  assert.throws(() => f.coordinator.begin('other', resolveGame('chibasko-pong'), [f.people[0]!], f.events))
  await f.coordinator.prepare(f.id)
  const auth = { transitionId: f.id, ...f.people[0]! }
  f.events.valid = () => false
  assert.equal(f.coordinator.authorize(auth, 'room', 'seat-A'), false)
  f.coordinator.disposed(f.id, 'room')
  assert.equal(f.counts.failed, 1)
  assert.equal(f.counts.destroyed, 1)
  const expired = fixture()
  expired.people[0]!.identity.expiresAt = 0
  // The snapshot is immutable; changing the caller's copy does not change admission.
  await expired.coordinator.prepare(expired.id)
  assert.equal(expired.coordinator.authorize({ transitionId: expired.id, ...expired.people[0]! }, 'room', 'seat-A'), false)
  expired.coordinator.cancel(expired.id)
})
test('activation failure cancels the session rather than reporting ready', async () => {
  const f = fixture({ activate: async () => { throw new Error('simulated') } })
  await f.coordinator.prepare(f.id)
  for (const person of f.people) f.coordinator.admitted({ transitionId: f.id, ...person }, 'room', `seat-${person.identity.userId}`)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.counts.ready, 0)
  assert.equal(f.counts.failed, 1)
  assert.equal(f.counts.destroyed, 1)
})
test('server-verified identity expiring before preparation prevents room creation', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 })
  const f = fixture()
  t.mock.timers.tick(60001)
  await f.coordinator.prepare(f.id)
  assert.equal(f.counts.created, 0)
  assert.equal(f.counts.failed, 1)
})

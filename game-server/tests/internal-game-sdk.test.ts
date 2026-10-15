import test from 'node:test'
import assert from 'node:assert/strict'
import { GameSessionCoordinator, type GameBackend } from '../src/platform/multiplayer/GameSessionCoordinator.js'
import { createInternalGameAdapter } from '../src/platform/multiplayer/internalGameAdapter.js'
import type { GameResult } from '@chibaskogames/sdk'
import type { GameClient as InternalGameClient } from '../src/platform/multiplayer/GameAdmission.js'
import { defineGame } from '@chibaskogames/sdk'
import { serverGameRegistration } from '../src/games/types.js'

async function fixture() {
  const counts = { ready: 0, completed: 0, failed: 0, destroyed: 0, expired: 0 }
  const people = ['A', 'B'].map(userId => ({ lobbySessionId: `lobby-${userId}`,
    identity: { userId, username: `Player ${userId}`, avatarUrl: null, expiresAt: Date.now() + 60000 } }))
  const room = { roomId: 'sdk-room' } as Awaited<ReturnType<GameBackend['create']>>
  const coordinator = new GameSessionCoordinator(5000, {
    create: async () => room,
    reserve: async (_room, auth) => ({ name: 'fixture', roomId: room.roomId, processId: 'fixture', sessionId: `seat-${auth.identity.userId}` }),
    activate: async () => { context.activate(id) },
    destroy: async () => { counts.destroyed++ },
  })
  const id = coordinator.begin('sdk-lobby', serverGameRegistration(defineGame({ id: 'test-game', integrationVersion: 1, capabilities: { online: { access: ['private'], players: { min: 2, max: 2 } } } }), 'fixture'), people,
    { valid: () => true, reservation() {}, ready() { counts.ready++ }, failed() { counts.failed++ }, completed() { counts.completed++ } })
  const platform = createInternalGameAdapter(coordinator)
  const context = platform.createContext({ transitionId: id, roomId: room.roomId, roomType: 'fixture' })
  const clients = people.map(person => ({ sessionId: `seat-${person.identity.userId}`, auth: { transitionId: id, ...person },
    leave() { counts.expired++ } }) as unknown as InternalGameClient)
  await coordinator.prepare(id)
  return { context, platform, coordinator, clients, counts, id }
}

test('SDK admission is bound to platform seats and exposes frozen public identity only', async () => {
  const f = await fixture()
  try {
    for (const options of [{ transitionId: 'unknown', roomId: 'sdk-room', roomType: 'fixture' },
      { transitionId: f.id, roomId: 'sdk-room', roomType: 'invented' }]) assert.throws(() => f.platform.createContext(options))
    const first = f.clients[0]!
    const auth = first.auth as { identity: { userId: string } }
    const forged = { ...first, auth: { ...auth, identity: { ...auth.identity, userId: 'outsider' } } } as InternalGameClient
    assert.throws(() => f.context.admit(forged))
    const player = f.context.admit(first)
    assert.deepEqual(player, { participantId: player.participantId, username: 'Player A', avatarUrl: null }); assert.notEqual(player.participantId, first.sessionId); assert.notEqual(player.participantId, 'A')
    assert.doesNotMatch(JSON.stringify(f.context.session), /transitionId|roomType|roomId|reservation|expiresAt|userId/); assert.ok(Object.isFrozen(player)); assert.ok(Object.isFrozen(f.context))
    assert.equal(f.context.getPlayer(first), player)
    assert.equal(f.context.getPlayer({ ...first } as InternalGameClient), null)
    assert.throws(() => f.context.admit(first))
    assert.deepEqual(Object.keys(f.platform), ['createContext'])
    assert.doesNotMatch(JSON.stringify(player), /expiresAt|JWT|email|auth|token/)
    // Mutating transport auth cannot change the admitted identity or notification.
    first.auth = forged.auth
    assert.equal(f.context.getPlayer(first)?.participantId, player.participantId)
    f.context.admitted(first)
    f.context.admit(f.clients[1]!); f.context.admitted(f.clients[1]!)
    await Promise.resolve(); assert.equal(f.counts.ready, 1)
  } finally { f.context.dispose(); await f.coordinator.shutdown() }
})

test('SDK completion validates results, delivers once, supports no winner/score and invalidates operations', async () => {
  const f = await fixture()
  const result: GameResult = { gameId: 'test-game', winnerParticipantId: null, reason: 'completed', players: f.context.session.participants.map(p => ({ participantId: p.participantId })) }
  try {
    assert.equal(f.context.session.complete(result), false)
    assert.throws(() => f.context.activate('other'))
    for (const client of f.clients) { f.context.admit(client); f.context.admitted(client) }
    await Promise.resolve()
    for (const invalid of [null, {}, { ...result, players: null }, { ...result, winnerParticipantId: 'outside' },
      { ...result, gameId: 'other' }, { ...result, email: 'private' }, { ...result, reason: 'bad reason' },
      { ...result, players: [{ participantId: f.context.session.participants[0]!.participantId, score: Infinity }, { participantId: f.context.session.participants[1]!.participantId }] },
      { ...result, players: [{ participantId: f.context.session.participants[0]!.participantId }, { participantId: f.context.session.participants[0]!.participantId }] }]) {
      assert.equal(f.context.session.complete(invalid as GameResult), false)
    }
    assert.equal(f.context.session.complete(result), true); assert.equal(f.context.session.complete(result), false)
    assert.equal(f.counts.completed, 1); assert.equal(f.context.getPlayer(f.clients[0]!), null)
    assert.throws(() => f.context.admit(f.clients[0]!))
    f.context.dispose(); f.context.dispose()
    assert.equal(f.context.session.complete(result), false)
    await f.coordinator.reset(f.id); assert.equal(f.counts.destroyed, 1)
  } finally { f.context.dispose(); await f.coordinator.shutdown() }
})

test('SDK expiry uses the verified snapshot and disposal removes its expiry timers', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 })
  const f = await fixture()
  try {
    const client = f.clients[0]!
    f.context.admit(client)
    t.mock.timers.tick(60001)
    assert.equal(f.context.getPlayer(client), null)
    assert.equal(f.counts.expired, 1)
    assert.throws(() => f.context.admit(f.clients[1]!))
    f.context.dispose()
  } finally { await f.coordinator.shutdown() }
  const clean = await fixture()
  for (const client of clean.clients) clean.context.admit(client)
  clean.context.dispose(); clean.context.dispose()
  t.mock.timers.tick(60001)
  assert.equal(clean.counts.expired, 0)
  assert.equal(clean.context.getPlayer(clean.clients[0]!), null)
  await clean.coordinator.shutdown()
})

test('SDK game failure cancels and cleans once without logging game data', async t => {
  const f = await fixture(), logs: string[] = []
  t.mock.method(console, 'info', (...args: unknown[]) => { logs.push(JSON.stringify(args)) })
  try {
    f.context.admit(f.clients[0]!)
    f.context.session.fail(); f.context.session.fail(); f.context.dispose()
    await f.coordinator.shutdown()
    assert.equal(f.counts.failed, 1); assert.equal(f.counts.destroyed, 1)
    assert.equal(f.context.getPlayer(f.clients[0]!), null)
    assert.equal(logs.length, 1); assert.match(logs[0]!, /room_unexpected_error/)
    assert.doesNotMatch(logs.join(''), /seat-|lobby-|Player|auth|token|expiresAt/)
  } finally { f.context.dispose(); await f.coordinator.shutdown() }
})

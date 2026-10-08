import test from 'node:test'
import assert from 'node:assert/strict'
import { canTransition, readReady, rosterCanStart, LOBBY_STATUS } from '../src/lobby/lobbyRules.js'
import { scheduleSessionExpiry } from '../src/auth/sessionExpiry.js'
test('session expiration fires at deadline and cancelled timers never fire', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  let expired = 0
  scheduleSessionExpiry(1100, () => expired++)
  t.mock.timers.tick(99)
  assert.equal(expired, 0)
  t.mock.timers.tick(1)
  assert.equal(expired, 1)
  const cancel = scheduleSessionExpiry(1200, () => expired++)
  cancel()
  t.mock.timers.tick(1000)
  assert.equal(expired, 1)
})
test('state machine only allows declared transitions', () => {
  assert.ok(canTransition('WAITING', 'STARTING'))
  assert.ok(canTransition('STARTING', 'WAITING'))
  assert.ok(canTransition('STARTING', 'PLAYING'))
  assert.ok(canTransition('PLAYING', 'RESULTS'))
  assert.ok(canTransition('RESULTS', 'CLOSED'))
  for (const state of Object.values(LOBBY_STATUS)) assert.equal(canTransition('CLOSED', state), false)
  assert.equal(canTransition('WAITING', 'PLAYING'), false)
  assert.equal(canTransition('PLAYING', 'WAITING'), false)
})
test('ready is strict and roster must have 2–4 ready unexpired players', () => {
  assert.equal(readReady({ ready: true }), true)
  assert.equal(readReady({ ready: false }), false)
  for (const payload of [null, [], {}, { ready: 'true' }, { ready: true, userId: 'x' }, { ready: true, status: 'PLAYING' }]) assert.throws(() => readReady(payload))
  const player = { ready: true, expiresAt: 100 }
  for (const n of [0, 1, 5]) assert.equal(rosterCanStart(Array(n).fill(player), 50), false)
  for (const n of [2, 3, 4]) assert.ok(rosterCanStart(Array(n).fill(player), 50))
  assert.equal(rosterCanStart([player, { ...player, ready: false }], 50), false)
  assert.equal(rosterCanStart([player, player], 100), false)
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { createCodeAllocator, normalizeLobbyCode } from '../src/lobby/lobbyCode.js'
test('codes have six unambiguous characters and normalize case and outer spaces', () => {
  const allocate = createCodeAllocator()
  for (let i = 0; i < 100; i++) assert.match(allocate(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  assert.equal(normalizeLobbyCode(' ab7kq2 '), 'AB7KQ2')
  for (const code of ['', 'AB7KQ', 'AB7KQ22', 'AB0KQ2', 'ABIKQ2', 'AB OK2']) assert.throws(() => normalizeLobbyCode(code))
})
test('collisions are retried and old codes remain reserved', () => {
  const candidates = ['AB7KQ2', 'AB7KQ2', 'CD8MN3']
  const allocate = createCodeAllocator(() => candidates.shift() ?? 'AB7KQ2')
  assert.equal(allocate(), 'AB7KQ2')
  assert.equal(allocate(), 'CD8MN3')
  assert.throws(allocate, /CODE_UNAVAILABLE/)
})

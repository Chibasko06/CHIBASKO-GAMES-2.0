import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeLobbyCode, connectLobby } from '../lib/lobbyConnection.ts'
test('lobby code normalizes without accepting ambiguous characters', () => {
  assert.equal(normalizeLobbyCode(' ab7kq2 '), 'AB7KQ2')
  assert.throws(() => normalizeLobbyCode('AB0KQ2'))
})
test('invalid lobby code never starts HTTP matchmaking', async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Unexpected network request') }
  try { await assert.rejects(connectLobby('test-token', 'invalid-code'), /Code invalide/) }
  finally { globalThis.fetch = original }
})

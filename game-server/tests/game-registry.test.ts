import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveGame } from '../src/games/registry.js'
import { rosterCanStart } from '../src/lobby/lobbyRules.js'
test('internal registry owns game type and capacities; unknown games fail closed', () => {
  const game = resolveGame('chibasko-pong')
  assert.deepEqual(game, { id: 'chibasko-pong', roomType: 'pong', minPlayers: 2, maxPlayers: 2 })
  assert.ok(Object.isFrozen(game))
  for (const id of ['external', 'unknown', undefined, { roomType: 'pong' }]) assert.throws(() => resolveGame(id))
  const player = { ready: true, expiresAt: 100 }
  assert.ok(rosterCanStart([player, player], 0, game))
  assert.equal(rosterCanStart([player, player, player], 0, game), false)
})

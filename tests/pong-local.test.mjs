import '../games/chibasko-pong/tests/local-runtime.test.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { allowedGameImport } from '../scripts/check-game-boundaries.mjs'
import { resolve } from 'node:path'

test('shared engine imports cannot reach SDK, browser, server, platform or rendering dependencies', () => {
  const root = resolve('games/chibasko-pong'), file = resolve(root, 'shared/simulation.ts')
  for (const spec of ['react', '@chibaskogames/sdk', '@colyseus/schema', '../client/pongView', '@/lib/auth', 'node:fs']) assert.equal(allowedGameImport(file, spec, root), false)
  assert.equal(allowedGameImport(file, './constants', root), true)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineGame, INTEGRATION_VERSION } from '@chibaskogames/sdk'
import { checkGameBoundaries, allowedGameImport, imports } from '../scripts/check-game-boundaries.mjs'
import { createGameClientConnection } from '../lib/multiplayer/gameClientModule.ts'
import { readGameSession } from '../lib/multiplayer/gameSessionMetadata.ts'

const definition = { id: 'test-game', integrationVersion: 1, capabilities: { online: { access: ['private'], players: { min: 2, max: 4 } } } }
export const envelope = () => ({ session: { id: 'opaque-session', gameId: 'test-game', integrationVersion: 1, execution: 'online' },
  participants: [{ participantId: 'participant-A', username: 'Alice', avatarUrl: null }, { participantId: 'participant-B', username: 'Bob', avatarUrl: null }],
  localParticipantIds: ['participant-A'], connectedParticipantIds: ['participant-A'], availability: 'preparing' })

test('pure SDK explicitly declares capabilities/version; local can differ without enabling a runtime', () => {
  assert.equal(INTEGRATION_VERSION, 1)
  const game = defineGame(definition)
  assert.deepEqual(game.capabilities.online.access, ['private']); assert.equal(game.capabilities.local, undefined)
  assert.ok(Object.isFrozen(game.capabilities.online.players))
  const future = defineGame({ ...definition, capabilities: { ...definition.capabilities, local: { players: { min: 2, max: 2 } } } })
  assert.equal(future.capabilities.local.players.max, 2)
  for (const d of [{ ...definition, integrationVersion: 2 }, { ...definition, capabilities: {} },
    { ...definition, capabilities: { online: { ...definition.capabilities.online, access: [] } } },
    { ...definition, capabilities: { local: { players: { min: 3, max: 2 } } } }]) assert.throws(() => defineGame(d))
})

test('SDK session metadata is independent of gameplay/transport, closed to private fields and incompatible versions', () => {
  const value = envelope(), snapshot = readGameSession(value, 'test-game')
  assert.ok(snapshot); assert.ok(Object.isFrozen(snapshot.participants[0]))
  for (const changed of [
    { ...value, session: { ...value.session, integrationVersion: 2 } },
    { ...value, session: { ...value.session, roomId: 'secret' } },
    { ...value, participants: [{ ...value.participants[0], email: 'secret' }] },
    { ...value, localParticipantIds: ['not-a-member'] },
    { ...value, connectedParticipantIds: ['participant-A', 'participant-A'] },
    { ...value, auth: 'secret' },
  ]) assert.equal(readGameSession(changed, 'test-game'), null)
  assert.equal(readGameSession(value, 'other'), null)
})

test('SDK facade follows participant/session metadata, invalidates once and never exposes transport', () => {
  let metadata = readGameSession(envelope(), 'test-game'), state = { question: 'Different game' }, sent = [], notified = 0
  const owner = createGameClientConnection({ getSession: () => metadata, getState: () => state, send: (...args) => sent.push(args) })
  const c = owner.connection, off = c.subscribe(() => notified++)
  assert.equal(c.localPlayerId, 'participant-A'); assert.equal(c.getSession().participants.length, 2)
  metadata = readGameSession({ ...envelope(), availability: 'ready' }, 'test-game'); state = { question: 'Next' }
  owner.changed(); assert.equal(notified, 1); assert.equal(c.getSession().availability, 'ready')
  c.send('answer', 1); off(); owner.dispose(); owner.dispose()
  c.send('late', 2); assert.deepEqual(sent, [['answer', 1]])
  assert.equal(c.getSession(), null); assert.equal(c.localPlayerId, ''); assert.equal(c.getState(), null)
  assert.doesNotMatch(Object.keys(c).join(' '), /auth|token|room|endpoint|leave|dispose/i)
})

test('game boundaries reject platform imports, SDK internals and computed module loading', async () => {
  await checkGameBoundaries()
  const root = resolve('games/test-game'), file = resolve(root, 'client/Game.tsx')
  for (const spec of ['@/app/admin', '@/lib/auth', '@/lib/supabaseClient', '../../../lib/auth',
    '@chibaskogames/sdk/src/private', '@colyseus/core']) assert.equal(allowedGameImport(file, spec, root), false)
  for (const spec of ['../shared/engine', '@chibaskogames/sdk', '@chibaskogames/sdk/client']) assert.equal(allowedGameImport(file, spec, root), true)
  assert.deepEqual(imports('const x = import(path);'), ['<non-literal import>'])
  for (const file of ['packages/game-sdk/src/index.ts','packages/game-sdk/src/client/index.ts','packages/game-sdk/src/server/index.ts']) {
    assert.doesNotMatch(await readFile(file,'utf8'), /from ['"](react|next|@colyseus|@supabase|node:)/)
  }
})

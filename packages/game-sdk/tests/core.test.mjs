import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { defineGame, INTEGRATION_VERSION } from '@chibaskogames/sdk'

const definition = () => ({ id: 'example-game', integrationVersion: 1, capabilities: {
  online: { access: ['public', 'private'], players: { min: 2, max: 4 } },
  local: { players: { min: 2, max: 2 } },
} })

test('definition preserves explicit capabilities and freezes its own copy', () => {
  const input = definition(), game = defineGame(input)
  assert.equal(INTEGRATION_VERSION, 1)
  assert.deepEqual(game, input)
  input.capabilities.online.access.pop()
  input.capabilities.local.players.max = 3
  assert.deepEqual(game.capabilities.online.access, ['public', 'private'])
  assert.equal(game.capabilities.local.players.max, 2)
  assert.throws(() => { game.capabilities.online.players.min = 0 }, TypeError)
  const local = defineGame({ id: 'local-only', integrationVersion: 1, capabilities: { local: { players: { min: 1, max: 2 } } } })
  assert.equal(local.capabilities.online, undefined)
})

test('invalid versions, capacities, identifiers and access policies are rejected', () => {
  const invalid = [
    { ...definition(), id: '../private' }, { ...definition(), integrationVersion: 2 },
    { ...definition(), capabilities: {} },
    ...[[], ['other'], ['private', 'private']].map(access => ({ ...definition(), capabilities: { online: { access, players: { min: 2, max: 2 } } } })),
    ...[{ min: 0, max: 2 }, { min: 3, max: 2 }, { min: 1.5, max: 2 }].map(players => ({ ...definition(), capabilities: { local: { players } } })),
  ]
  for (const input of invalid) assert.throws(() => defineGame(input), /INVALID_GAME_DEFINITION/)
})

test('only documented entrypoints are accessible; non-React entries have no external runtime imports', async () => {
  assert.deepEqual(Object.keys(await import('@chibaskogames/sdk/client')), [])
  assert.deepEqual(Object.keys(await import('@chibaskogames/sdk/server')), [])
  await assert.rejects(import('@chibaskogames/sdk/src/index.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  for (const path of ['index.js', 'client/index.js', 'server/index.js']) {
    const source = await readFile(new URL('../dist/' + path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /\b(?:import|require)\s*\(|\bfrom\s*['"]|\bimport\s*['"]/)
  }
  const sourceRoot = new URL('../src/', import.meta.url)
  async function check(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) await check(url)
      else {
        const source = await readFile(url, 'utf8')
        const imports = [...source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map(match => match[1])
        for (const specifier of imports) {
          if (specifier === 'react' && url.pathname.includes('/src/react/')) continue
          assert.ok(specifier.startsWith('.') && new URL(specifier, url).href.startsWith(sourceRoot.href), specifier)
        }
      }
    }
  }
  await check(sourceRoot)
})

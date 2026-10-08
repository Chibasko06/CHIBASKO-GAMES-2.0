import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateGameCatalogue } from '../lib/server/gameCatalogueValidation.ts'
import { changeGameFormType, gameFormPayload, getMultiplayerDefinition, multiplayerCapacityLabel, isClassicGame, isChibaskoMultiplayerGame } from '../lib/multiplayer/catalogue.ts'
import { checkManifest, generateManifest, assertManifestCurrent } from '../scripts/generate-game-manifest.mjs'
import { POST } from '../app/api/admin/games/route.ts'
import { PATCH } from '../app/api/admin/games/[id]/route.ts'

const classic = { title: 'Test', slug: 'test', game_url: 'https://example.com/game', category_ids: [] }
const multi = { ...classic, game_type: 'multiplayer_chibasko', game_url: null, multiplayer_game_id: 'chibasko-pong', is_beta: true }
test('manifest matches registry, exposes only public capacities and detects stale content', async () => {
  await checkManifest()
  assert.deepEqual(JSON.parse(generateManifest()), { 'chibasko-pong': { minPlayers: 2, maxPlayers: 2 } })
  assert.throws(() => assertManifestCurrent(generateManifest(new Map())), /stale/)
  assert.deepEqual(getMultiplayerDefinition('chibasko-pong'), { minPlayers: 2, maxPlayers: 2 })
  assert.equal(getMultiplayerDefinition('toString'), undefined)
  assert.equal(multiplayerCapacityLabel('chibasko-pong'), '2 joueurs')
})
test('classic defaults and URL validation; multiplayer identity is conditional', () => {
  const { payload } = validateGameCatalogue(classic)
  assert.equal(payload.game_type, 'classic')
  assert.equal(payload.is_beta, false)
  assert.equal(payload.is_published, true)
  assert.ok(isClassicGame(payload))
  for (const game_url of [undefined, null, '', 'javascript:alert(1)', '/games/local', 'https://user:password@example.com']) {
    assert.throws(() => validateGameCatalogue({ ...classic, game_url }))
  }
  assert.throws(() => validateGameCatalogue({ ...classic, multiplayer_game_id: 'chibasko-pong' }))
})
test('known multiplayer accepted, unpublished by default; beta retained; invalid inputs refused', () => {
  const { payload } = validateGameCatalogue(multi)
  assert.ok(isChibaskoMultiplayerGame(payload))
  assert.equal(payload.is_published, false)
  assert.equal(payload.is_beta, true)
  for (const changes of [
    { multiplayer_game_id: null }, { multiplayer_game_id: '' }, { multiplayer_game_id: 'unknown' },
    { game_url: 'https://example.com' }, { game_type: 'external' },
    { is_beta: 'false' }, { is_published: 'true' }, { category_ids: ['invalid'] },
  ]) assert.throws(() => validateGameCatalogue({ ...multi, ...changes }))
  for (const key of ['roomType', 'room_type', 'minPlayers', 'maxPlayers', 'endpoint', 'server_url', 'provider', 'userId', 'id', 'views_count']) {
    assert.throws(() => validateGameCatalogue({ ...multi, [key]: 'arbitrary' }))
  }
})
test('form switching preserves inactive values and categories; serialization excludes inactive launch fields', () => {
  const initial = { ...classic, category_ids: ['11111111-1111-4111-8111-111111111111'], game_type: 'classic', multiplayer_game_id: '', is_published: true, is_beta: false }
  const changed = changeGameFormType(initial, 'multiplayer_chibasko', false)
  assert.equal(changed.is_published, false)
  assert.equal(changed.game_url, initial.game_url)
  const chosen = { ...changed, multiplayer_game_id: 'chibasko-pong', is_beta: true }
  assert.equal(validateGameCatalogue(gameFormPayload(chosen)).payload.game_url, null)
  const back = changeGameFormType(chosen, 'classic', true)
  const payload = validateGameCatalogue(gameFormPayload(back)).payload
  assert.equal(payload.game_url, classic.game_url)
  assert.equal(payload.multiplayer_game_id, null)
  assert.equal(payload.is_beta, true)
  assert.deepEqual(gameFormPayload(back).category_ids, initial.category_ids)
  assert.equal(changeGameFormType(initial, 'multiplayer_chibasko', true).is_published, true)
})

test('admin routes validate before writes, preserve PATCH thumbnail concurrency and categories', async () => {
  const writes = []
  let previous = { thumbnail_url: null }
  const client = { from(table) {
    const chain = {
      select() { return chain }, eq() { return chain }, is() { writes.push(['thumbnail-condition']); return chain },
      insert(payload) { writes.push(['insert', table, payload]); chain.result = { ...payload, id: 'existing-id' }; return chain },
      update(payload) { writes.push(['update', table, payload]); chain.result = { ...payload, id: 'existing-id' }; return chain },
      delete() { writes.push(['delete-relations', table]); return chain },
      async single() { return { data: chain.result ?? previous, error: null } },
      then(resolve) { return Promise.resolve({ error: null }).then(resolve) },
    }
    return chain
  } }
  globalThis.__r2 = { adminCheck: async () => ({ supabaseAdmin: client }) }
  const req = body => new Request('https://example.com/api/admin/games', { method: 'POST', body: JSON.stringify(body) })
  globalThis.__r2.adminCheck = async () => ({ error: new Response(null, { status: 403 }) })
  assert.equal((await POST(req(multi))).status, 403)
  assert.equal((await PATCH(req(multi), { params: Promise.resolve({ id: 'existing-id' }) })).status, 403)
  assert.equal(writes.length, 0)
  globalThis.__r2.adminCheck = async () => ({ supabaseAdmin: client })
  const created = await POST(req(classic))
  assert.equal(created.status, 200)
  assert.equal(writes[0][2].game_type, 'classic')
  assert.equal((await POST(req(multi))).status, 200)
  assert.equal(writes.at(-1)[2].is_published, false)
  const before = writes.length
  assert.equal((await POST(req({ ...multi, maxPlayers: 99 }))).status, 400)
  assert.equal(writes.length, before)
  assert.equal((await PATCH(req({ ...multi, is_published: true }), { params: Promise.resolve({ id: 'existing-id' }) })).status, 200)
  const update = writes.find(entry => entry[0] === 'update')
  assert.equal(update[2].is_beta, true)
  assert.equal(update[2].game_url, null)
  assert.equal((await PATCH(req(classic), { params: Promise.resolve({ id: 'existing-id' }) })).status, 200)
  assert.equal(writes.filter(entry => entry[0] === 'update').at(-1)[2].multiplayer_game_id, null)
  assert.ok(writes.some(entry => entry[0] === 'thumbnail-condition'))
  assert.ok(writes.every(entry => entry[0] !== 'delete-relations' || entry[1] === 'game_categories'))
  previous = { thumbnail_url: null }
})

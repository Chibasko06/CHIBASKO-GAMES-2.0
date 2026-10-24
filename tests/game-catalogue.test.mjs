import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateGameCatalogue } from '../lib/server/gameCatalogueValidation.ts'
import { changeGameFormType, gameFormPayload, multiplayerCapacityLabel, isClassicGame, isChibaskoMultiplayerGame } from '../lib/multiplayer/catalogue.ts'
import { POST } from '../app/api/admin/games/route.ts'
import { PATCH } from '../app/api/admin/games/[id]/route.ts'

const classic = { title: 'Test', slug: 'test', game_url: 'https://example.com/game', category_ids: [] }
const multi = { ...classic, game_type: 'multiplayer_chibasko', game_url: null, multiplayer_game_id: 'chibasko-pong', is_beta: true }
test('capacity labels consume version capabilities, without a source registry',()=>{assert.equal(multiplayerCapacityLabel({online:{access:['public'],players:{min:4,max:128}}}),'4–128 joueurs');assert.equal(multiplayerCapacityLabel(undefined),'Indisponible')})

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
test('catalogue identifier accepted independently of source, unpublished by default; beta retained; invalid inputs refused', () => {
  const { payload } = validateGameCatalogue(multi)
  assert.ok(isChibaskoMultiplayerGame(payload))
  assert.equal(payload.is_published, false)
  assert.equal(payload.is_beta, true)
  for (const changes of [
    { multiplayer_game_id: null }, { multiplayer_game_id: '' }, { multiplayer_game_id: '../engine' },
    { game_url: 'https://example.com' }, { game_type: 'external' },
    { is_beta: 'false' }, { is_published: 'true' }, { category_ids: ['invalid'] },
  ]) assert.throws(() => validateGameCatalogue({ ...multi, ...changes }))
  for (const key of ['roomType', 'room_type', 'minPlayers', 'maxPlayers', 'endpoint', 'server_url', 'provider', 'userId', 'id', 'views_count']) {
    assert.throws(() => validateGameCatalogue({ ...multi, [key]: 'arbitrary' }))
  }
})
test('form switching clears incompatible launch fields and preserves categories/identity', () => {
  const initial = { ...classic, category_ids: ['11111111-1111-4111-8111-111111111111'], game_type: 'classic', multiplayer_game_id: '', is_published: true, is_beta: false }
  const changed = changeGameFormType(initial, 'multiplayer_chibasko', false)
  assert.equal(changed.is_published, false)
  assert.equal(changed.game_url, '')
  const chosen = { ...changed, multiplayer_game_id: 'chibasko-pong', is_beta: true }
  assert.equal(validateGameCatalogue(gameFormPayload(chosen)).payload.game_url, null)
  const back = changeGameFormType(chosen, 'classic', true)
  assert.equal(back.multiplayer_game_id, '')
  assert.equal(back.game_url, '')
  assert.throws(() => validateGameCatalogue(gameFormPayload(back)))
  const payload = validateGameCatalogue(gameFormPayload({...back,game_url:classic.game_url})).payload
  assert.equal(payload.game_url, classic.game_url)
  assert.equal(payload.multiplayer_game_id, null)
  assert.equal(payload.is_beta, true)
  assert.deepEqual(gameFormPayload(back).category_ids, initial.category_ids)
  assert.equal(changeGameFormType(initial, 'multiplayer_chibasko', true).is_published, true)
})

test('admin routes validate before the transactional RPC and preserve thumbnail preconditions and categories', async () => {
  const writes=[]
  const client={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{thumbnail_url:null},error:null}}}},
    async rpc(name,args){assert.equal(name,'admin_save_game');writes.push(args);return {data:{game:{id:'existing-id',...args.p_game},previousThumbnail:null},error:null}}}
  const req=body=>new Request('https://example.com/api/admin/games',{method:'POST',body:JSON.stringify(body)})
  globalThis.__r2={adminCheck:async()=>({error:new Response(null,{status:403})})}
  assert.equal((await POST(req(multi))).status,403)
  assert.equal((await PATCH(req(multi),{params:Promise.resolve({id:'existing-id'})})).status,403)
  assert.equal(writes.length,0)
  globalThis.__r2.adminCheck=async()=>({supabaseAdmin:client,user:{id:'admin'}})
  assert.equal((await POST(req(classic))).status,200)
  assert.equal(writes[0].p_game.game_type,'classic')
  assert.equal((await POST(req(multi))).status,200)
  assert.equal(writes.at(-1).p_game.is_published,false)
  const before=writes.length
  assert.equal((await POST(req({...multi,maxPlayers:99}))).status,400)
  assert.equal(writes.length,before)
  assert.equal((await PATCH(req({...multi,is_published:true}),{params:Promise.resolve({id:'existing-id'})})).status,200)
  assert.equal(writes.at(-1).p_game.is_beta,true)
  assert.equal(writes.at(-1).p_game.game_url,null)
  assert.equal((await PATCH(req(classic),{params:Promise.resolve({id:'existing-id'})})).status,200)
  assert.equal(writes.at(-1).p_game.multiplayer_game_id,null)
  assert.ok(writes.every(args=>args.p_actor==='admin'&&'p_expected_thumbnail' in args&&Array.isArray(args.p_categories)))
})

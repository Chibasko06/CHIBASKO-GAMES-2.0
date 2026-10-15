import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { matchMaker } from '@colyseus/core'
import { defineGame } from '@chibaskogames/sdk'
import { createPlaygroundServer } from '../src/index.js'
import { serverGameRegistration } from '../src/games/types.js'
import { PublicLobbyDirectory } from '../src/lobby/PublicLobbyDirectory.js'
import { readPolicy } from '../src/runtime/config.js'
import { connectLobby } from '../../lib/lobbyConnection.js'
import { createProductSession } from '../../lib/multiplayer/productSession.js'

const gameId = 'chibasko-pong'
const origin = 'https://chibaskogames.fr'
const identity = async (token?: string) => {
  if (!token) throw new Error('Denied')
  return { userId: `private-${token}`, username: `Player ${token}`, avatarUrl: null, expiresAt: Date.now() + 60000 }
}
async function until(check: () => boolean) { const deadline = Date.now() + 4000; while (!check()) { if (Date.now() > deadline) throw new Error('Public directory deadline'); await delay(15) } }
async function endpointOf(server: ReturnType<typeof createPlaygroundServer>) {
  await server.listen(0, '127.0.0.1'); const address = server.transport.server!.address(); assert.ok(address && typeof address !== 'string')
  return `http://127.0.0.1:${address.port}`
}

test('directory stores bounded, copied public snapshots; expiry, remove and shutdown clear', () => {
  const directory = new PublicLobbyDirectory()
  const summary = { code: 'ABCDEF', gameId, host: { username: 'A', avatarUrl: null }, currentPlayers: 1, maxPlayers: 2, secret: 'not projected' }
  directory.update(summary.code, summary, 100)
  summary.host.username = 'mutated'
  const list = directory.list(gameId, 0); assert.equal(list[0].host.username, 'A')
  list[0].host.username = 'mutated again'
  assert.equal(directory.list(gameId, 0)[0].host.username, 'A')
  assert.equal(JSON.stringify(list).includes('secret'), false)
  assert.deepEqual(directory.list('other', 0), []); assert.deepEqual(directory.list(gameId, 100), [])
  for (let i = 0; i < 60; i++) directory.update(String(i), summary, 1000)
  assert.equal(directory.list(gameId, 0).length, 50)
  directory.remove('0'); directory.update('1', null); directory.clear(); assert.deepEqual(directory.list(gameId, 0), [])
})

test('public product flow: private invisible, authenticated minimal listing, stale/racing joins and host transfer', { timeout: 15000 }, async () => {
  const server = createPlaygroundServer(identity, { startDelayMs: 100 }, {}, readPolicy({ ALLOWED_ORIGINS: origin }))
  const rooms: Awaited<ReturnType<typeof connectLobby>>[] = []
  const controllers: ReturnType<typeof createProductSession>[] = []
  try {
    const endpoint = await endpointOf(server)
    const list = (extra: Record<string, string> = {}) => fetch(`${endpoint}/lobbies/public?gameId=${gameId}`, { headers: { Origin: origin, Authorization: 'Bearer observer', ...extra } })
    assert.equal((await list({ Authorization: '' })).status, 401)
    assert.equal((await list({ Origin: 'https://evil.example' })).status, 403)
    assert.equal((await fetch(`${endpoint}/lobbies/public?gameId=unknown`, { headers: { Origin: origin, Authorization: 'Bearer observer' } })).status, 404)
    assert.equal((await fetch(`${endpoint}/lobbies/public?gameId=${gameId}&extra=1`, { headers: { Origin: origin } })).status, 400)
    const preflight = await fetch(`${endpoint}/lobbies/public?gameId=${gameId}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' } })
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin)
    assert.match(preflight.headers.get('Access-Control-Allow-Methods')!, /GET/)
    const privateRoom = await connectLobby('A', undefined, endpoint, gameId, { visibility: 'private' }); rooms.push(privateRoom)
    assert.deepEqual(await (await list()).json(), { lobbies: [] })
    await assert.rejects(connectLobby('B', privateRoom.roomId, endpoint, gameId, { publicOnly: true }), /LOBBY_UNAVAILABLE/)
    const game = { slug: 'fixture', gameId }
    const createController = (token: string) => {
      const controller = createProductSession({ endpoint, catalogue: async () => game, getSession: async () => ({ access_token: token, user: { id: `private-${token}` } }) })
      controller.accountChanged(`private-${token}`); controllers.push(controller); return controller
    }
    const a = createController('host')
    const created = await a.connect(game, undefined, { visibility: 'public' }); assert.ok(created)
    a.navigate(`/games/fixture/lobby/${created.code}`)
    assert.equal(a.getSnapshot().lobby?.visibility, 'public')
    const response = await list(); assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const expected = { code: created.code, gameId, host: { username: 'Player host', avatarUrl: null }, currentPlayers: 1, maxPlayers: 2 }
    assert.deepEqual(await response.json(), { lobbies: [expected] })
    assert.deepEqual(await a.listPublic(gameId), [expected])
    assert.doesNotMatch(JSON.stringify(expected), /userId|sessionId|private-|reservation|email|transitionId|processId|token/)
    await assert.rejects(connectLobby('wrong', created.code, endpoint, 'other-game', { publicOnly: true }), /WRONG_GAME/)
    const joins = await Promise.allSettled(['B', 'C'].map(token => connectLobby(token, created.code, endpoint, gameId, { publicOnly: true })))
    assert.equal(joins.filter(result => result.status === 'fulfilled').length, 1, 'only one last seat can be reserved/admitted')
    const admitted = joins.find(result => result.status === 'fulfilled')! as PromiseFulfilledResult<Awaited<ReturnType<typeof connectLobby>>>
    rooms.push(admitted.value)
    assert.deepEqual(await (await list()).json(), { lobbies: [] }, 'full room absent')
    const stale = createController('late')
    assert.equal(await stale.connect(game, created.code, { publicOnly: true }), null)
    assert.equal(stale.getSnapshot().error, 'Ce salon n’est plus disponible.')
    admitted.value.onMessage('game_cancelled', () => {})
    admitted.value.send('set_ready', { ready: true }); a.ready(true)
    await until(() => a.getSnapshot().lobby?.players.every(p => p.ready) === true)
    a.start(); await until(() => admitted.value.state.status === 'STARTING')
    assert.deepEqual(await (await list()).json(), { lobbies: [] })
    a.disconnect()
    await until(() => admitted.value.state.players.size === 1 && admitted.value.state.status === 'WAITING')
    await delay(80)
    const afterTransfer = (await (await list()).json()).lobbies
    assert.equal(afterTransfer.length, 1); assert.equal(afterTransfer[0].currentPlayers, 1)
    assert.equal(afterTransfer[0].host.username, [...admitted.value.state.players.values()][0].username)
    const byCode = createController('code-guest')
    assert.ok(await byCode.connect(null, created.code), 'a public lobby can also be joined through the existing global code resolver')
    byCode.disconnect()
    await admitted.value.leave(); await until(() => !matchMaker.getLocalRoomById(created.code))
    assert.deepEqual(await (await list()).json(), { lobbies: [] }, 'destroyed room removed')
    for (let i = 0; i < 30; i++) await list({ 'X-Real-IP': '203.0.113.20' })
    assert.equal((await list({ 'X-Real-IP': '203.0.113.20' })).status, 429)
    assert.equal((await list({ 'X-Real-IP': '203.0.113.21' })).status, 200)
  } finally { controllers.forEach(c => c.disconnect()); for (const room of rooms) if (room.connection.isOpen) await room.leave().catch(() => {}); await server.gracefullyShutdown(false) }
})

test('server capabilities enforce public-only/private-only and disabled games; forged visibility refused', { timeout: 15000 }, async () => {
  for (const access of ['public', 'private'] as const) {
    const definition = defineGame({ id: gameId, integrationVersion: 1, capabilities: { online: { access: [access], players: { min: 2, max: 2 } } } })
    const server = createPlaygroundServer(identity, { registry: new Map([[gameId, serverGameRegistration(definition, 'pong')]]) })
    let room: Awaited<ReturnType<typeof connectLobby>> | undefined
    try {
      const endpoint = await endpointOf(server)
      await assert.rejects(connectLobby('A', undefined, endpoint, gameId, { visibility: access === 'public' ? 'private' : 'public' }), /ACCESS_UNSUPPORTED/)
      room = await connectLobby('A', undefined, endpoint, gameId, { visibility: access })
      assert.equal(room.state.visibility, access)
      const result = await fetch(`${endpoint}/lobbies/public?gameId=${gameId}`, { headers: { Authorization: 'Bearer A' } })
      assert.equal(result.status, access === 'public' ? 200 : 403)
    } finally { if (room) await room.leave(); await server.gracefullyShutdown(false) }
  }
  const server = createPlaygroundServer(identity, {}, {}, readPolicy({ NODE_ENV: 'production', ALLOWED_ORIGINS: origin, ENABLED_GAME_IDS: '' }))
  try {
    const endpoint = await endpointOf(server)
    assert.equal((await fetch(`${endpoint}/lobbies/public?gameId=${gameId}`)).status, 403, 'production listing requires an allowed Origin')
    const listing = await fetch(`${endpoint}/lobbies/public?gameId=${gameId}`, { headers: { Origin: origin, Authorization: 'Bearer A' } })
    assert.equal(listing.status, 404)
    const create = await fetch(`${endpoint}/matchmake/create/lobby`, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer A', 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId, visibility: 'public' }) })
    assert.equal(create.ok, false)
  } finally { await server.gracefullyShutdown(false) }
})

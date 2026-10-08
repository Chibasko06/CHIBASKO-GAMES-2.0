import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { createPlaygroundServer } from '../src/index.js'
import { createProductSession, isProductGameReady } from '../../lib/multiplayer/productSession.js'

async function until(check: () => boolean) {
  const end = Date.now() + 5000
  while (!check()) { if (Date.now() > end) throw new Error('Product flow timed out'); await delay(10) }
}
test('product network: create, global code resolution, expected game, duplicate, private admissions and cleanup', { timeout: 15000 }, async t => {
  const server = createPlaygroundServer(async token => {
    if (!['A', 'B'].includes(token ?? '')) throw new Error('Denied')
    return { userId: `user-${token}`, username: `Player ${token}`, avatarUrl: null, expiresAt: Date.now() + 60000 }
  }, { startDelayMs: 80 })
  const controllers: ReturnType<typeof createProductSession>[] = []
  try {
    await server.listen(0, '127.0.0.1')
    const address = server.transport.server?.address()
    assert.ok(address && typeof address !== 'string')
    const endpoint = `http://127.0.0.1:${address.port}`
    const urls: string[] = []
    server.transport.server?.on('upgrade', req => { urls.push(req.url ?? ''); assert.equal(req.headers.authorization, undefined) })
    const game = { slug: 'chibasko-pong', gameId: 'chibasko-pong' }
    function player(token: string) {
      const c = createProductSession({ endpoint, getSession: async () => ({ access_token: token, user: { id: `user-${token}` } }), catalogue: async id => id === game.gameId ? game : null })
      c.accountChanged(`user-${token}`); controllers.push(c); return c
    }
    const a = player('A'), b = player('B')
    const created = await a.connect(game)
    assert.ok(created); assert.match(created.code, /^[A-HJ-NP-Z2-9]{6}$/)
    assert.equal(a.getSnapshot().lobby?.players[0]?.host, true)
    a.navigate(`/games/${game.slug}/lobby/${created.code}`)
    assert.ok(a.getSnapshot().lobby, 'route handoff preserves creator connection')
    const duplicate = player('A')
    assert.equal(await duplicate.connect(game, created.code), null)
    assert.match(duplicate.getSnapshot().error, /déjà présent/)
    const wrong = player('B')
    assert.equal(await wrong.connect({ ...game, gameId: 'other-game' }, created.code), null)
    assert.match(wrong.getSnapshot().error, /autre jeu/)
    const lookup = await fetch(`${endpoint}/lobbies/${created.code}`, { method: 'POST', headers: { Authorization: 'Bearer B' } })
    assert.deepEqual(await lookup.json(), { gameId: 'chibasko-pong' })
    assert.equal((await fetch(`${endpoint}/lobbies/${created.code}`, { method: 'POST' })).status, 401)
    assert.equal((await fetch(`${endpoint}/lobbies/ZZZZZZ`, { method: 'POST', headers: { Authorization: 'Bearer B' } })).status, 404)
    assert.ok(await b.connect(null, ` ${created.code.toLowerCase()} `))
    await until(() => a.getSnapshot().lobby?.players.length === 2)
    b.start(); await until(() => b.getSnapshot().error.includes('hôte'))
    a.ready(true); b.ready(true)
    await until(() => a.getSnapshot().lobby?.players.every(p => p.ready) === true)
    const statuses: string[] = []
    const unsubscribe = a.subscribe(() => { const status = a.getSnapshot().lobby?.status; if (status) statuses.push(status) })
    a.start()
    await until(() => isProductGameReady(a.getSnapshot()) && isProductGameReady(b.getSnapshot()))
    unsubscribe()
    assert.ok(statuses.includes('STARTING')); assert.ok(statuses.includes('PLAYING'))
    assert.equal(a.getSnapshot().game.count, 2)
    for (const c of [a, b]) {
      const json = JSON.stringify(c.getSnapshot())
      for (const field of ['sessionId', 'userId', 'expiresAt', 'reservation', 'access_token', 'email', 'processId']) assert.equal(json.includes(field), false)
    }
    for (const url of urls) { assert.equal(url.includes('_authToken'), false); assert.deepEqual([...new URL(url, endpoint).searchParams.keys()], ['sessionId']) }
    a.disconnect()
    await until(() => b.getSnapshot().lobby?.status === 'WAITING' && b.getSnapshot().lobby?.players.length === 1)
    assert.equal(b.getSnapshot().lobby?.players[0]?.host, true)
    assert.equal(b.getSnapshot().lobby?.players[0]?.ready, false)
    b.accountChanged(null); assert.equal(b.getSnapshot().lobby, null)
    let limited = false
    for (let i = 0; i < 11; i++) {
      const response = await fetch(`${endpoint}/lobbies/ZZZZZZ`, { method: 'POST', headers: { Authorization: 'Bearer B' } })
      if (response.status === 429) { assert.deepEqual(await response.json(), { error: 'RATE_LIMIT' }); limited = true }
    }
    assert.equal(limited, true)
    t.diagnostic('Product A creates and remains host across route; B resolves code and joins; both ready; STARTING → both private GameRoom admissions → PLAYING → UI-ready state; leave resets and transfers host.')
  } finally {
    controllers.forEach(c => c.disconnect())
    await delay(30); await server.gracefullyShutdown(false)
  }
})

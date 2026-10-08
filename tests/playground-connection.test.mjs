import test from 'node:test'
import assert from 'node:assert/strict'
import { createPlaygroundSession } from '../lib/playgroundSession.ts'
import { connectPlayground } from '../lib/playgroundConnection.ts'

const session = id => ({ access_token: 'test-access-token', user: { id } })
test('JWT is only an HTTP Authorization header; redirected reservation origin is rejected before WebSocket', async () => {
  const original = globalThis.fetch
  const token = 'test.supabase.signature'
  let requests = 0
  globalThis.fetch = async (url, init) => {
    requests++
    assert.equal(String(url), 'http://127.0.0.1:2567/matchmake/joinOrCreate/playground')
    assert.equal(init.headers.Authorization, `Bearer ${token}`)
    assert.equal(init.body, '{}')
    assert.equal(init.redirect, 'error')
    assert.equal(init.credentials, 'omit')
    return Response.json({ sessionId: 'opaque-ticket', roomId: 'room', processId: 'process', publicAddress: 'evil.invalid' })
  }
  try {
    await assert.rejects(connectPlayground(token), /Unsafe connection URL/)
    assert.equal(requests, 1)
    await assert.rejects(connectPlayground(token, 'http://evil.invalid'), /Invalid game server origin/)
    assert.equal(requests, 1)
  } finally { globalThis.fetch = original }
})
function fixture(getSession = async () => session('one')) {
  let joins = 0
  let leaves = 0
  let release
  const room = { async leave() { leaves++ } }
  const controller = createPlaygroundSession(getSession, async token => {
    assert.equal(token, 'test-access-token')
    joins++
    if (release !== undefined) await new Promise(resolve => { release = resolve })
    return room
  })
  return { controller, room, counts: () => ({ joins, leaves }), pending() { release = null }, release() { release() } }
}
test('session obtained on every click and absent session never attempts matchmaking', async () => {
  let reads = 0
  const f = fixture(async () => { reads++; return null })
  await assert.rejects(f.controller.connect())
  assert.equal(reads, 1)
  assert.equal(f.counts().joins, 0)
})
test('account change during session lookup prevents stale matchmaking', async () => {
  let resolveSession
  const f = fixture(() => new Promise(resolve => { resolveSession = resolve }))
  const pending = f.controller.connect()
  f.controller.accountChanged('two')
  resolveSession(session('one'))
  assert.equal(await pending, null)
  assert.equal(f.counts().joins, 0)
})
for (const action of ['signOut', 'accountChange', 'unmount']) {
  test(`${action} closes active connection`, async () => {
    const f = fixture()
    await f.controller.connect()
    if (action === 'unmount') f.controller.dispose()
    else f.controller.accountChanged(action === 'signOut' ? null : 'two')
    assert.equal(f.counts().leaves, 1)
  })
  test(`${action} closes a late asynchronous join`, async () => {
    const f = fixture()
    f.pending()
    const pending = f.controller.connect()
    await new Promise(resolve => setImmediate(resolve))
    if (action === 'unmount') f.controller.dispose()
    else f.controller.accountChanged(action === 'signOut' ? null : 'two')
    f.release()
    assert.equal(await pending, null)
    assert.equal(f.counts().leaves, 1)
  })
}

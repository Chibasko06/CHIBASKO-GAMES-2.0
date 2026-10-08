import test from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@colyseus/sdk'
import { createPlaygroundServer, runtimeStates } from '../src/index.js'
import { readPolicy, readRuntimeConfig } from '../src/runtime/config.js'
import { getTrustedClientIp, WindowLimiter } from '../src/runtime/requestPolicy.js'
import { createShutdown } from '../src/runtime/lifecycle.js'
import { sdkLogger } from '../src/runtime/logging.js'
import { fork } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const origin = 'https://chibaskogames.fr'
const production = (enabled = '') => readPolicy({ NODE_ENV: 'production', ALLOWED_ORIGINS: origin, ENABLED_GAME_IDS: enabled })
const identity = async (token?: string) => {
  if (!token) throw new Error('Denied')
  return { userId: token, username: 'Player', avatarUrl: null, expiresAt: Date.now() + 60000 }
}
test('runtime configuration fails closed; production games opt in, dev explicit origins', () => {
  for (const env of [{ NODE_ENV: 'production' }, { NODE_ENV: 'production', ALLOWED_ORIGINS: '*' }, { PORT: '0' }, { PORT: '1.1' }, { HOST: '' }, { ALLOWED_ORIGINS: 'https://example.com/path' }, { ENABLED_GAME_IDS: 'invented' }, { NODE_ENV: 'production', ALLOWED_ORIGINS: origin, DEBUG: '*' }]) assert.throws(() => readPolicy(env))
  assert.deepEqual(production().enabledGames, [])
  assert.ok(readPolicy({}).enabledGames.includes('chibasko-pong'))
  assert.ok(readPolicy({}).origins.includes('http://localhost:3000'))
  assert.throws(() => readRuntimeConfig({ SUPABASE_URL: 'not-a-url' }))
  assert.throws(() => readRuntimeConfig({ SUPABASE_URL: 'https://example.com', SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fake' }))
})
test('proxy headers trusted only on exact loopback; IPv4/IPv6, invalid headers safe', () => {
  const req = (direct: string, ip: string) => ({ socket: { remoteAddress: direct }, headers: { 'x-real-ip': ip, 'x-forwarded-for': '1.1.1.1', 'cf-connecting-ip': '2.2.2.2' } })
  assert.equal(getTrustedClientIp(req('203.0.113.1', '8.8.8.8')), '203.0.113.1')
  assert.equal(getTrustedClientIp(req('127.0.0.1', '203.0.113.2')), '203.0.113.2')
  assert.equal(getTrustedClientIp(req('::ffff:127.0.0.1', '2001:db8::1')), '2001:db8::1')
  assert.equal(getTrustedClientIp(req('::1', 'bad, ip')), '::1')
  const limiter = new WindowLimiter(1, 10)
  assert.ok(limiter.take('A', 0)); assert.equal(limiter.take('A', 1), false)
  assert.ok(limiter.take('B', 1)); assert.ok(limiter.take('A', 11))
  limiter.clear(); assert.ok(limiter.take('A', 12))
})
test('HTTP and real WebSocket origins, health, production playground, game availability and shutdown admission', { timeout: 15000 }, async () => {
  const server = createPlaygroundServer(identity, {}, {}, production('chibasko-pong'))
  const rooms: { leave(): Promise<unknown> }[] = []
  try {
    await server.listen(0, '127.0.0.1')
    const address = server.transport.server!.address(); assert.ok(address && typeof address !== 'string')
    const endpoint = `http://127.0.0.1:${address.port}`
    const request = (path: string, extra: HeadersInit = {}, method = 'POST', body = { gameId: 'chibasko-pong' }) => fetch(endpoint + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer A', ...extra }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) })
    assert.deepEqual(await (await fetch(endpoint + '/health')).json(), { status: 'ok' })
    assert.equal((await fetch(endpoint + '/')).status, 404)
    for (const path of ['/matchmake/create/lobby', '/lobbies/ABCDEF']) {
      assert.equal((await request(path)).status, 403)
      assert.equal((await request(path, { Origin: 'https://evil.example' })).status, 403)
      const options = await request(path, { Origin: origin }, 'OPTIONS')
      assert.equal(options.status, 204); assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin)
      assert.equal(options.headers.get('Access-Control-Allow-Credentials'), null)
    }
    assert.equal((await request('/matchmake/create/playground', { Origin: origin })).ok, false)
    const urls: string[] = []
    server.transport.server!.on('upgrade', req => urls.push(req.url ?? ''))
    const reserve = async (token: string) => {
      const result = await request('/matchmake/create/lobby', { Origin: origin, Authorization: `Bearer ${token}` })
      assert.equal(result.headers.get('Access-Control-Allow-Origin'), origin)
      assert.equal(result.status, 200); return result.json()
    }
    const awaitReservation = await reserve('A')
    const rejected = new Client(endpoint, { headers: { Origin: 'https://evil.example' } })
    await assert.rejects(() => rejected.consumeSeatReservation(awaitReservation))
    const client = new Client(endpoint, { headers: { Origin: origin } })
    const room = await client.consumeSeatReservation(await reserve('B')); rooms.push(room)
    for (const url of urls) { const parsed = new URL(url, endpoint); assert.deepEqual([...parsed.searchParams.keys()], ['sessionId']); assert.equal(parsed.searchParams.has('_authToken'), false) }
    for (let i = 0; i < 3; i++) rooms.push(await client.consumeSeatReservation(await reserve('creator')))
    assert.equal((await request('/matchmake/create/lobby', { Origin: origin, Authorization: 'Bearer creator' })).status, 429)
    await rooms.pop()!.leave()
    await new Promise(resolve => setTimeout(resolve, 50))
    rooms.push(await client.consumeSeatReservation(await reserve('creator')))
    for (let i = 0; i < 10; i++) await request('/lobbies/ZZZZZZ', { Origin: origin, 'X-Real-IP': '203.0.113.10' })
    assert.equal((await request('/lobbies/ZZZZZZ', { Origin: origin, 'X-Real-IP': '203.0.113.10' })).status, 429)
    assert.notEqual((await request('/lobbies/ZZZZZZ', { Origin: origin, 'X-Real-IP': '203.0.113.11' })).status, 429)
    for (let i = 0; i < 60; i++) await request('/matchmake/joinById/ZZZZZZ', { Origin: origin, 'X-Real-IP': '203.0.113.12' })
    assert.equal((await request('/matchmake/joinById/ZZZZZZ', { Origin: origin, 'X-Real-IP': '203.0.113.12' })).status, 429)
    assert.notEqual((await request('/matchmake/joinById/ZZZZZZ', { Origin: origin, 'X-Real-IP': '203.0.113.13' })).status, 429)
    for (let i = 0; i < 10; i++) await request('/matchmake/create/lobby', { Origin: origin, 'X-Real-IP': '203.0.113.14' }, 'POST', { gameId: 'unknown-game' })
    assert.equal((await request('/matchmake/create/lobby/', { Origin: origin, 'X-Real-IP': '203.0.113.14' })).status, 429)
    runtimeStates.get(server)!.shuttingDown = true
    const health = await fetch(endpoint + '/health'); assert.equal(health.status, 503); assert.deepEqual(await health.json(), { status: 'shutting_down' })
    assert.equal((await request('/matchmake/create/lobby', { Origin: origin })).status, 503)
    await assert.rejects(() => client.consumeSeatReservation(awaitReservation))
  } finally { for (const room of rooms) await room.leave().catch(() => {}); await server.gracefullyShutdown(false) }
  const disabled = createPlaygroundServer(identity, {}, {}, production())
  try {
    await disabled.listen(0, '127.0.0.1'); const address = disabled.transport.server!.address(); assert.ok(address && typeof address !== 'string')
    const result = await fetch(`http://127.0.0.1:${address.port}/matchmake/create/lobby`, { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer A', 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: 'chibasko-pong' }) })
    assert.equal(result.ok, false)
  } finally { await disabled.gracefullyShutdown(false) }
})
test('real DEV/production entrypoint starts, health responds, signal and fatal shutdown exit correctly', { timeout: 15000 }, async () => {
  for (const mode of ['development', 'production'] as const) {
    const socket = createServer()
    await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve))
    const address = socket.address(); assert.ok(address && typeof address !== 'string')
    await new Promise<void>(resolve => socket.close(() => resolve()))
    const child = fork(fileURLToPath(new URL('./fixtures/runtime-child.ts', import.meta.url)), [], {
      execArgv: ['--import', 'tsx'], silent: true,
      // Deliberately isolated fixture configuration, never the local .env/production.
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, NODE_ENV: mode,
        HOST: '127.0.0.1', PORT: String(address.port), SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_fixture', ALLOWED_ORIGINS: origin, ENABLED_GAME_IDS: '' },
    })
    let output = ''; child.stdout!.on('data', data => { output += String(data) }); child.stderr!.on('data', data => { output += String(data) })
    const exited = new Promise<number | null>(resolve => child.once('exit', resolve))
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Startup deadline')), 5000)
        child.once('message', () => { clearTimeout(timer); resolve() })
      })
      const response = await fetch(`http://127.0.0.1:${address.port}/health`)
      assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: 'ok' })
      child.send(mode === 'production' ? 'fatal' : 'SIGTERM')
      assert.equal(await exited, mode === 'production' ? 1 : 0)
      assert.ok(output.includes('server_started')); assert.ok(output.includes('server_shutdown_completed'))
      assert.equal(output.includes('test_fixture'), false); assert.equal(output.includes('private_failure'), false)
    } finally { if (child.exitCode === null) child.kill() }
  }
})
test('shutdown idempotence, timeout, failures and fatal exit; log arguments discarded', async () => {
  const outputs: string[] = []; const original = console.info; console.info = (...args: unknown[]) => { outputs.push(args.join(' ')) }
  try {
    let count = 0; const codes: number[] = []; const state = { shuttingDown: false }
    const stop = createShutdown(state, async () => { count++ }, c => { codes.push(c) }, 50)
    const first = stop(); const second = stop(); assert.equal(first, second); await first
    assert.equal(count, 1); assert.equal(state.shuttingDown, true); assert.deepEqual(codes, [0])
    await createShutdown({ shuttingDown: false }, async () => {}, c => { codes.push(c) })(true)
    await createShutdown({ shuttingDown: false }, () => new Promise(() => {}), c => { codes.push(c) }, 5)()
    await createShutdown({ shuttingDown: false }, async () => { throw new Error('secret') }, c => { codes.push(c) })()
    assert.deepEqual(codes, [0, 1, 1, 1])
    const errorLogger: (...args: unknown[]) => void = sdkLogger.error; errorLogger('JWT secret email reservation Authorization')
    assert.equal(outputs.join().includes('secret'), false)
  } finally { console.info = original }
})

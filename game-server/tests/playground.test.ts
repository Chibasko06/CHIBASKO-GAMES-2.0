import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Client, type Room } from '@colyseus/sdk'
import { matchMaker } from '@colyseus/core'
import { createPlaygroundServer } from '../src/index.js'
import type { PlaygroundState } from '../src/schema/PlaygroundState.js'
import { validateMove } from '../src/validation/move.js'
import { connectPlayground } from '../../lib/playgroundConnection.js'
import type { AuthenticatedPlayer } from '../src/auth/supabaseAuth.js'
import { setItem } from '../../node_modules/@colyseus/sdk/build/Storage.mjs'

const token = 'test.supabase.signature'
const authenticate = async (value: string | undefined): Promise<AuthenticatedPlayer> => {
  if (value !== token) throw new Error('Denied')
  return { userId: 'verified-user', username: 'Verified name', avatarUrl: null, expiresAt: Date.now() + 60000 }
}

test('move validates shape, finite integer coordinates, bounds, step and rate', () => {
  const position = { x: 50, y: 50 }
  for (const payload of [null, [], {}, { x: '51', y: 50 }, { x: Infinity, y: 50 }, { x: NaN, y: 50 }, { x: 50.5, y: 50 }, { x: 51, y: 50, sessionId: 'other' }]) {
    assert.equal(validateMove(payload, position, 1000), 'invalid_payload')
  }
  assert.equal(validateMove({ x: -1, y: 50 }, position, 1000), 'out_of_bounds')
  assert.equal(validateMove({ x: 101, y: 50 }, position, 1000), 'out_of_bounds')
  assert.equal(validateMove({ x: 52, y: 50 }, position, 1000), 'invalid_step')
  assert.equal(validateMove({ x: 51, y: 51 }, position, 1000), 'invalid_step')
  assert.equal(validateMove(position, position, 1000), 'invalid_step')
  assert.equal(validateMove({ x: 51, y: 50 }, position, 1099, 1000), 'rate_limited')
  assert.deepEqual(validateMove({ x: 51, y: 50 }, position, 1100, 1000), { x: 51, y: 50 })
  assert.deepEqual(validateMove({ x: 0, y: 0 }, { x: 1, y: 0 }, 1000), { x: 0, y: 0 })
})

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for synchronized state')
    await delay(10)
  }
}

test('authenticated HTTP reservations, tokenless WebSockets, shared identity, moves, leave and expiry', { timeout: 15000 }, async t => {
  let expiresAt = Date.now() + 60000
  const server = createPlaygroundServer(async value => ({ ...await authenticate(value), expiresAt }))
  const rooms: Room<PlaygroundState>[] = []
  try {
    await server.listen(0, '127.0.0.1')
    const address = server.transport.server?.address()
    assert.ok(address && typeof address !== 'string')
    const endpoint = `http://127.0.0.1:${address.port}`
    const client = new Client(endpoint)
    const observed: string[] = []
    server.transport.server?.on('upgrade', request => {
      observed.push(request.url ?? '')
      assert.equal(request.headers.authorization, undefined)
    })
    await assert.rejects(client.joinOrCreate('playground'))
    const forged = await fetch(`${endpoint}/matchmake/joinOrCreate/playground`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'fake', username: 'fake', avatarUrl: 'fake' }) })
    assert.equal(forged.ok, false)
    // Seed the SDK's persisted token to prove consumeSeatReservation never forwards it.
    setItem('colyseus-auth-token', token)
    const a = await connectPlayground<PlaygroundState>(token, endpoint)
    rooms.push(a)
    const b = await connectPlayground<PlaygroundState>(token, endpoint)
    setItem('colyseus-auth-token', '')
    rooms.push(b)
    a.onMessage('move_rejected', () => {})
    b.onMessage('move_rejected', () => {})
    assert.equal(a.roomId, b.roomId)
    assert.notEqual(a.sessionId, b.sessionId)
    await until(() => a.state?.players?.size === 2 && b.state?.players?.size === 2)
    assert.equal(observed.length, 2)
    for (const raw of observed) {
      const url = new URL(raw, endpoint)
      assert.deepEqual([...url.searchParams.keys()], ['sessionId'])
      assert.ok(!raw.includes(token) && !raw.includes('_authToken'))
    }
    const redacted = new URL(observed[0]!, endpoint)
    redacted.protocol = 'ws:'
    redacted.pathname = '/[process-masked]/[room-masked]'
    redacted.search = '?sessionId=[ticket-masked]'
    t.diagnostic(`Observed WebSocket, identifiers redacted: ${redacted.href}`)
    for (const player of a.state.players.values()) {
      assert.equal(player.userId, 'verified-user')
      assert.equal(player.username, 'Verified name')
      assert.equal(player.avatarUrl, '')
      assert.deepEqual(Object.keys(player.toJSON()).sort(), ['avatarUrl', 'userId', 'username', 'x', 'y'])
    }
    assert.equal(matchMaker.getLocalRoomById(a.roomId)?.maxClients, 16)
    const rejected = new Promise<{ code: string }>(resolve => a.onMessage('move_rejected', resolve))
    a.send('move', { x: 51, y: 50, sessionId: b.sessionId })
    assert.equal((await rejected).code, 'invalid_payload')
    assert.equal(b.state.players.get(a.sessionId)?.x, 50)
    a.send('move', { x: 51, y: 50 })
    await until(() => b.state.players.get(a.sessionId)?.x === 51 && a.state.players.get(a.sessionId)?.x === 51)
    assert.equal(b.state.players.get(b.sessionId)?.x, 50)
    b.send('move', { x: 50, y: 49 })
    await until(() => a.state.players.get(b.sessionId)?.y === 49)
    await a.leave()
    await until(() => b.state.players.size === 1 && !b.state.players.has(a.sessionId))
    const reserve = async () => {
      const response = await fetch(`${endpoint}/matchmake/joinOrCreate/playground`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}',
      })
      assert.ok(response.ok)
      return response.json()
    }
    const reserved = await reserve()
    const c = await client.consumeSeatReservation<PlaygroundState>(reserved)
    rooms.push(c)
    await assert.rejects(client.consumeSeatReservation(reserved))
    await assert.rejects(client.consumeSeatReservation({ ...reserved, sessionId: 'forged-reservation' }))
    const localRoom = matchMaker.getLocalRoomById(b.roomId)!
    localRoom.seatReservationTimeout = 0.05
    const expired = await reserve()
    await delay(100)
    await assert.rejects(client.consumeSeatReservation(expired))
    localRoom.seatReservationTimeout = 10
    expiresAt = Date.now() + 200
    const d = await connectPlayground<PlaygroundState>(token, endpoint)
    rooms.push(d)
    const code = await new Promise<number>(resolve => d.onLeave(resolve))
    assert.equal(code, 4001)
  } finally {
    await Promise.allSettled(rooms.filter(room => room.connection.isOpen).map(room => room.leave()))
    await server.gracefullyShutdown(false)
  }
})

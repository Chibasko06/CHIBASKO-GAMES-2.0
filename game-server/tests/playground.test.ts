import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Client, type Room } from '@colyseus/sdk'
import { matchMaker } from '@colyseus/core'
import { createPlaygroundServer } from '../src/index.js'
import type { PlaygroundState } from '../src/schema/PlaygroundState.js'
import { validateMove } from '../src/validation/move.js'

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

test('two real clients share a room, synchronize only validated moves and remove leaving players', { timeout: 15000 }, async () => {
  const server = createPlaygroundServer()
  const rooms: Room<PlaygroundState>[] = []
  try {
    await server.listen(0, '127.0.0.1')
    const address = server.transport.server?.address()
    assert.ok(address && typeof address !== 'string')
    const client = new Client(`http://127.0.0.1:${address.port}`)
    const a = await client.joinOrCreate<PlaygroundState>('playground')
    rooms.push(a)
    const b = await client.joinOrCreate<PlaygroundState>('playground')
    rooms.push(b)
    a.onMessage('move_rejected', () => {})
    b.onMessage('move_rejected', () => {})
    assert.equal(a.roomId, b.roomId)
    assert.notEqual(a.sessionId, b.sessionId)
    await until(() => a.state?.players?.size === 2 && b.state?.players?.size === 2)
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
  } finally {
    await Promise.allSettled(rooms.filter(room => room.connection.isOpen).map(room => room.leave()))
    await server.gracefullyShutdown(false)
  }
})

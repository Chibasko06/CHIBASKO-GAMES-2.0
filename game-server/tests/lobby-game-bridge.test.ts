import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { matchMaker } from '@colyseus/core'
import { createPlaygroundServer } from '../src/index.js'
import { connectLobby } from '../../lib/lobbyConnection.js'
import { consumeGameReservation } from '../../lib/gameConnection.js'
import type { Reservation } from '../src/platform/multiplayer/GameSessionCoordinator.js'
import type { PongState } from '../src/games/chibasko-pong/PongState.js'

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000
  while (!predicate()) { if (Date.now() >= deadline) throw new Error('Synchronization timed out'); await delay(10) }
}
test('network bridge: private seats, real admissions, PLAYING, timeout, retry and cleanup', { timeout: 20000 }, async t => {
  let created = 0
  let failure: 'create' | 'reserve' | undefined
  let reserved = 0
  const server = createPlaygroundServer(async token => {
    if (!['A', 'B', 'C'].includes(token ?? '')) throw new Error('Denied')
    return { userId: `user-${token}`, username: `Player ${token}`, avatarUrl: null, expiresAt: Date.now() + 60000 }
  }, { startDelayMs: 30 }, { timeoutMs: 600, backend: {
    create: async (definition, transitionId) => {
      created++
      if (failure === 'create') throw new Error('simulated creation failure')
      return matchMaker.createRoom(definition.roomType, { transitionId })
    },
    reserve: async (room, auth) => {
      if (failure === 'reserve' && ++reserved === 2) throw new Error('simulated partial reservation failure')
      return matchMaker.reserveSeatFor(room, {}, auth)
    },
  } })
  const connections: { leave(): Promise<unknown>; connection: { isOpen: boolean } }[] = []
  try {
    await server.listen(0, '127.0.0.1')
    const address = server.transport.server?.address()
    assert.ok(address && typeof address !== 'string')
    const endpoint = `http://127.0.0.1:${address.port}`
    const ws: string[] = []
    server.transport.server?.on('upgrade', request => { ws.push(request.url ?? ''); assert.equal(request.headers.authorization, undefined) })
    const request = (method: string, target: string, body: unknown = {}) => fetch(`${endpoint}/matchmake/${method}/${target}`, {
      method: 'POST', headers: { Authorization: 'Bearer C', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    for (const body of [{ gameId: 'unknown' }, { gameId: 'chibasko-pong', maxPlayers: 4 }, { gameId: 'chibasko-pong', roomType: 'playground' }, { gameId: 'chibasko-pong', provider: 'external' }, { gameId: 'chibasko-pong', url: 'http://other.invalid' }]) {
      assert.equal((await request('create', 'lobby', body)).ok, false)
    }
    const a = await connectLobby('A', undefined, endpoint)
    const b = await connectLobby('B', a.roomId, endpoint)
    connections.push(a, b)
    for (const room of [a, b]) { room.onMessage('lobby_error', () => {}); room.onMessage('game_cancelled', () => {}) }
    assert.equal(a.state.gameId, 'chibasko-pong')
    assert.equal(a.state.minPlayers, 2); assert.equal(a.state.maxPlayers, 2)
    await assert.rejects(connectLobby('C', a.roomId, endpoint))
    type Offer = { transitionId: string; gameId: string; reservation: Reservation }
    const offersA: Offer[] = [], offersB: Offer[] = []
    a.onMessage('game_reservation', offer => offersA.push(offer))
    b.onMessage('game_reservation', offer => offersB.push(offer))
    const start = async () => {
      a.send('set_ready', { ready: true }); b.send('set_ready', { ready: true })
      await until(() => a.state.players.get(a.sessionId)?.ready === true && a.state.players.get(b.sessionId)?.ready === true)
      a.send('start_game'); a.send('start_game')
    }
    await start()
    await until(() => offersA.length === 1 && offersB.length === 1)
    const firstA = offersA[0]!, firstB = offersB[0]!
    assert.equal(created, 1)
    assert.equal(firstA.reservation.name, 'pong')
    assert.equal(firstA.reservation.roomId, firstB.reservation.roomId)
    assert.notEqual(firstA.reservation.sessionId, firstB.reservation.sessionId)
    assert.equal((await request('create', 'pong', { transitionId: firstA.transitionId })).ok, false)
    assert.equal((await request('joinById', firstA.reservation.roomId, { userId: 'user-A' })).ok, false)
    await assert.rejects(consumeGameReservation({ ...firstA.reservation, sessionId: 'forged-seat' }, endpoint))
    const gameA = await consumeGameReservation<PongState>(firstA.reservation, endpoint)
    connections.push(gameA)
    await until(() => gameA.state?.players?.size === 1)
    assert.equal(a.state.status, 'STARTING')
    assert.equal(gameA.state.players.get(gameA.sessionId)?.userId, 'user-A')
    const gameB = await consumeGameReservation<PongState>(firstB.reservation, endpoint)
    connections.push(gameB)
    await until(() => a.state.status === 'PLAYING' && b.state.status === 'PLAYING' && gameA.state.status === 'READY' && gameB.state?.players?.size === 2)
    assert.equal(gameB.state.players.get(gameB.sessionId)?.userId, 'user-B')
    assert.equal(gameA.state.expectedPlayers, 2)
    assert.ok(a.connection.isOpen && b.connection.isOpen)
    await assert.rejects(consumeGameReservation(firstA.reservation, endpoint))
    assert.ok(gameA.connection.isOpen)
    for (const state of [a.state, gameA.state]) {
      const serialized = JSON.stringify(state)
      for (const key of ['reservation', 'transitionId', 'expiresAt', 'email', 'access_token', 'identity']) assert.equal(serialized.includes(key), false)
    }
    t.diagnostic('A+B: two private reservations, first admission keeps STARTING, second admission activates PongRoom and Lobby PLAYING')
    await gameA.leave()
    await until(() => a.state.status === 'WAITING' && b.state.status === 'WAITING' && !matchMaker.getLocalRoomById(firstA.reservation.roomId))
    assert.equal(a.state.players.get(a.sessionId)?.ready, false)
    assert.equal(b.state.players.get(b.sessionId)?.ready, false)
    await start()
    await until(() => offersA.length === 2 && offersB.length === 2)
    const secondA = offersA[1]!, secondB = offersB[1]!
    const alone = await consumeGameReservation<PongState>(secondA.reservation, endpoint)
    connections.push(alone)
    await until(() => alone.state?.players?.size === 1)
    assert.equal(a.state.status, 'STARTING')
    await until(() => a.state.status === 'WAITING' && !matchMaker.getLocalRoomById(secondA.reservation.roomId))
    assert.equal(alone.connection.isOpen, false)
    await assert.rejects(consumeGameReservation(secondB.reservation, endpoint))
    assert.equal(a.state.players.get(a.sessionId)?.ready, false)
    t.diagnostic('A only: transition deadline expires, PongRoom destroyed, both lobby connections preserved, WAITING and ready reset')
    await start()
    await until(() => offersA.length === 3 && offersB.length === 3)
    const third = offersB[2]!
    await b.leave()
    await until(() => a.state.status === 'WAITING' && !matchMaker.getLocalRoomById(third.reservation.roomId))
    await assert.rejects(consumeGameReservation(third.reservation, endpoint))
    const replacement = await connectLobby('B', a.roomId, endpoint)
    connections.push(replacement)
    replacement.onMessage('lobby_error', () => {})
    replacement.onMessage('game_cancelled', () => {})
    replacement.onMessage('game_reservation', () => {})
    await until(() => a.state.players.get(replacement.sessionId) !== undefined)
    for (const mode of ['create', 'reserve'] as const) {
      failure = mode
      const previous = created
      a.send('set_ready', { ready: true }); replacement.send('set_ready', { ready: true })
      await until(() => a.state.players.get(a.sessionId)?.ready === true && a.state.players.get(replacement.sessionId)?.ready === true)
      a.send('start_game')
      await until(() => created > previous && a.state.status === 'WAITING' && replacement.state.status === 'WAITING'
        && a.state.players.get(a.sessionId)?.ready === false && a.state.players.get(replacement.sessionId)?.ready === false)
      assert.equal(a.state.players.get(a.sessionId)?.ready, false)
      assert.equal(a.state.players.get(replacement.sessionId)?.ready, false)
      assert.equal(offersA.length, 3) // Partial reservation failures publish no tickets.
    }
    failure = undefined
    a.send('set_ready', { ready: true }); replacement.send('set_ready', { ready: true })
    await until(() => a.state.players.get(a.sessionId)?.ready === true && a.state.players.get(replacement.sessionId)?.ready === true)
    a.send('start_game')
    await until(() => offersA.length === 4)
    const interrupted = offersA[3]!.reservation.roomId
    await matchMaker.getLocalRoomById(interrupted)!.disconnect()
    await until(() => a.state.status === 'WAITING' && replacement.state.status === 'WAITING')
    await replacement.leave()
    for (const url of ws) {
      const query = new URL(url, endpoint).searchParams
      assert.deepEqual([...query.keys()], ['sessionId'])
      assert.equal(query.has('_authToken'), false)
    }
    await a.leave()
    await until(() => !matchMaker.getLocalRoomById(a.roomId))
  } finally {
    await Promise.allSettled(connections.filter(room => room.connection.isOpen).map(room => room.leave()))
    await server.gracefullyShutdown(false)
  }
})

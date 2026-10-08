import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Client } from '@colyseus/sdk'
import { matchMaker } from '@colyseus/core'
import { createPlaygroundServer } from '../src/index.js'
import { connectLobby } from '../../lib/lobbyConnection.js'
import type { LobbyState } from '../src/schema/LobbyState.js'
import { consumeGameReservation } from '../../lib/gameConnection.js'

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 4000
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Synchronization timed out'); await delay(10) }
}
test('lobby authenticated lifecycle, creator guarantee, duplicates, security, ready, launch, host and expiry', { timeout: 20000 }, async () => {
  const expirations = new Map<string, number>()
  const lobbyConfig = { startDelayMs: 300, registry: new Map([['chibasko-pong', { id: 'chibasko-pong', roomType: 'pong', minPlayers: 2, maxPlayers: 4 }]]) }
  const server = createPlaygroundServer(async token => {
    if (!token || !['A', 'B', 'C', 'D', 'E'].includes(token)) throw new Error('Denied')
    return { userId: `user-${token}`, username: `Name ${token}`, avatarUrl: null, expiresAt: expirations.get(token) ?? Date.now() + 60000 }
  }, lobbyConfig)
  const rooms: { leave(): Promise<unknown>; connection: { isOpen: boolean } }[] = []
  try {
    await server.listen(0, '127.0.0.1')
    const address = server.transport.server?.address()
    assert.ok(address && typeof address !== 'string')
    const endpoint = `http://127.0.0.1:${address.port}`
    const rawClient = new Client(endpoint)
    const wsUrls: string[] = []
    server.transport.server?.on('upgrade', request => { wsUrls.push(request.url ?? ''); assert.equal(request.headers.authorization, undefined) })
    const reserve = (method: string, target: string, token?: string, body: unknown = {}) => fetch(`${endpoint}/matchmake/${method}/${target}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(method === 'create' && Object.keys(body as object).length === 0 ? { gameId: 'chibasko-pong' } : body),
    })
    const join = async (token: string, code?: string) => {
      const room = await connectLobby(token, code, endpoint)
      room.onMessage('lobby_error', () => {})
      room.onMessage('game_cancelled', () => {})
      room.onMessage('game_reservation', async (message: { reservation: unknown }) => {
        const game = await consumeGameReservation(message.reservation, endpoint)
        rooms.push(game)
      })
      rooms.push(room)
      return room
    }
    const rejected = (room: Awaited<ReturnType<typeof join>>, type: string, payload?: unknown) => {
      const event = new Promise<{ code: string }>(resolve => room.onMessage('lobby_error', resolve))
      room.send(type, payload)
      return event
    }
    const count = (room: Awaited<ReturnType<typeof join>>) => { let n = 0; room.state.players.forEach(() => n++); return n }
    assert.equal((await reserve('create', 'lobby')).ok, false)
    for (const body of [{ userId: 'fake' }, { hostUserId: 'fake' }, { status: 'PLAYING' }, { _creatorUserId: 'user-B' }]) assert.equal((await reserve('create', 'lobby', 'A', body)).ok, false)
    assert.equal((await reserve('joinOrCreate', 'lobby', 'A')).ok, false)
    const first = await reserve('create', 'lobby', 'A')
    assert.ok(first.ok)
    const reservation = await first.json()
    // Even knowing the code, B cannot take the host's place before creator admission.
    assert.equal((await reserve('joinById', reservation.roomId, 'B')).ok, false)
    const creator = await rawClient.consumeSeatReservation<LobbyState>(reservation)
    rooms.push(creator)
    creator.onMessage('lobby_error', () => {})
    await until(() => creator.state?.hostUserId === 'user-A')
    assert.equal(creator.state.code, reservation.roomId)
    await creator.leave()
    await until(() => !matchMaker.getLocalRoomById(reservation.roomId))

    assert.equal((await reserve('joinById', 'ZZZZZZ', 'A')).ok, false)
    const a = await join('A')
    assert.equal(a.state.hostUserId, 'user-A')
    assert.equal((await rejected(a, 'start_game')).code, 'NOT_READY')
    const b = await join('B', a.state.code.toLowerCase())
    await until(() => count(a) === 2)
    assert.equal((await reserve('joinById', a.roomId)).ok, false)
    const racing = await Promise.allSettled([join('C', a.roomId), join('C', a.roomId)])
    assert.equal(racing.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(racing.filter(result => result.status === 'rejected').length, 1)
    for (const result of racing) if (result.status === 'fulfilled') {
      assert.ok(result.value.connection.isOpen)
      await result.value.leave()
    }
    await until(() => count(a) === 2)
    await assert.rejects(join('A', a.state.code))
    assert.ok(a.connection.isOpen)
    const separate = await join('A')
    assert.notEqual(separate.roomId, a.roomId)
    await separate.leave()
    assert.equal((await rejected(b, 'start_game')).code, 'HOST_REQUIRED')
    a.send('set_ready', { ready: true })
    await until(() => a.state.players.get(a.sessionId)?.ready === true)
    assert.equal((await rejected(a, 'start_game')).code, 'NOT_READY') // another player is not ready
    a.send('set_ready', { ready: false })
    await until(() => a.state.players.get(a.sessionId)?.ready === false)
    for (const payload of [{ ready: 'true' }, { ready: true, userId: 'user-A' }, { ready: true, hostUserId: 'user-B' }, { ready: true, status: 'PLAYING' }]) assert.equal((await rejected(b, 'set_ready', payload)).code, 'INVALID_PAYLOAD')
    b.send('set_ready', { ready: true })
    await until(() => a.state.players.get(b.sessionId)?.ready === true)
    assert.equal(a.state.players.get(a.sessionId)?.ready, false)
    assert.equal((await rejected(a, 'start_game')).code, 'NOT_READY') // host must be ready too
    a.send('set_ready', { ready: true })
    await until(() => b.state.players.get(a.sessionId)?.ready === true)
    const pending = await (await reserve('joinById', a.roomId, 'C')).json()
    a.send('start_game')
    await until(() => a.state.status === 'STARTING' && b.state.status === 'STARTING')
    assert.equal((await reserve('joinById', a.roomId, 'D')).ok, false)
    await assert.rejects(rawClient.consumeSeatReservation(pending))
    assert.equal((await rejected(b, 'set_ready', { ready: false })).code, 'INVALID_STATE')
    await until(() => a.state.status === 'PLAYING' && b.state.status === 'PLAYING')
    assert.equal((await reserve('joinById', a.roomId, 'D')).ok, false)
    const closedId = a.roomId
    const local = matchMaker.getLocalRoomById(closedId)!
    await a.leave()
    await until(() => b.state.hostUserId === 'user-B' && count(b) === 1)
    await until(() => b.state.status === 'WAITING')
    await b.leave()
    await until(() => !matchMaker.getLocalRoomById(closedId))
    assert.equal(local.state.status, 'CLOSED')
    assert.equal((await reserve('joinById', closedId, 'B')).ok, false)

    for (const size of [3, 4]) {
      const host = await join('A')
      const members = [host]
      for (const token of ['B', 'C', 'D'].slice(0, size - 1)) members.push(await join(token, host.roomId))
      await until(() => count(host) === size)
      if (size === 4) await assert.rejects(join('E', host.roomId))
      for (const member of members) member.send('set_ready', { ready: true })
      await until(() => members.every(member => { let all = true; member.state.players.forEach(player => { all &&= player.ready }); return all }))
      host.send('start_game')
      await until(() => members.every(member => member.state.status === 'STARTING'))
      await until(() => members.every(member => member.state.status === 'PLAYING'))
      await Promise.all(members.map(member => member.leave()))
    }
    const host = await join('A')
    const oldest = await join('B', host.roomId)
    const newest = await join('C', host.roomId)
    await until(() => count(host) === 3)
    for (const room of [host, oldest, newest]) room.send('set_ready', { ready: true })
    await until(() => host.state.players.get(newest.sessionId)?.ready === true && host.state.players.get(oldest.sessionId)?.ready === true && host.state.players.get(host.sessionId)?.ready === true)
    host.send('start_game')
    await until(() => oldest.state.status === 'STARTING')
    await host.leave()
    await until(() => oldest.state.status === 'WAITING' && newest.state.status === 'WAITING' && oldest.state.hostUserId === 'user-B' && newest.state.hostUserId === 'user-B')
    oldest.state.players.forEach(player => assert.equal(player.ready, false))
    await delay(350)
    assert.equal(oldest.state.status, 'WAITING')
    const expiringCode = oldest.roomId
    await oldest.leave(); await newest.leave()
    await until(() => !matchMaker.getLocalRoomById(expiringCode))
    const survivor = await join('A')
    lobbyConfig.startDelayMs = 1000
    expirations.set('B', Date.now() + 600)
    const expiring = await join('B', survivor.roomId)
    await until(() => count(survivor) === 2)
    survivor.send('set_ready', { ready: true })
    expiring.send('set_ready', { ready: true })
    await until(() => survivor.state.players.get(survivor.sessionId)?.ready === true && survivor.state.players.get(expiring.sessionId)?.ready === true)
    survivor.send('start_game')
    await until(() => survivor.state.status === 'STARTING')
    await until(() => !expiring.connection.isOpen && count(survivor) === 1)
    assert.equal(survivor.state.status, 'WAITING')
    assert.equal(survivor.state.players.get(survivor.sessionId)?.ready, false)
    await delay(1050)
    assert.equal(survivor.state.status, 'WAITING')
    const privateState = JSON.stringify(survivor.state)
    for (const forbidden of ['expiresAt', 'email', 'access_token', 'identity', 'supabase']) assert.ok(!privateState.includes(forbidden))
    const emptyPending = await (await reserve('joinById', survivor.roomId, 'C')).json()
    const emptyId = survivor.roomId
    await survivor.leave()
    await until(() => !matchMaker.getLocalRoomById(emptyId))
    await assert.rejects(rawClient.consumeSeatReservation(emptyPending))
    for (const raw of wsUrls) assert.deepEqual([...new URL(raw, endpoint).searchParams.keys()], ['sessionId'])
  } finally {
    await Promise.allSettled(rooms.filter(room => room.connection.isOpen).map(room => room.leave()))
    await server.gracefullyShutdown(false)
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { matchMaker } from '@colyseus/core'
import { createPlaygroundServer } from '../src/index.js'
import { connectLobby } from '../../lib/lobbyConnection.js'
import { consumeGameReservation } from '../../lib/gameConnection.js'
import type { Reservation } from '../src/platform/multiplayer/GameSessionCoordinator.js'
import type { PongState } from '../src/games/chibasko-pong/PongState.js'

async function until(check: () => boolean) { const deadline = Date.now() + 12000; while (!check()) { if (Date.now() > deadline) throw new Error('Network assertion deadline'); await delay(15) } }
test('two clients play, share score/results, return WAITING and replay; game-only forfeit', { timeout: 35000 }, async t => {
  const server = createPlaygroundServer(async token => {
    if (!['A', 'B'].includes(token ?? '')) throw new Error('Denied')
    return { userId: `user-${token}`, username: `Player ${token}`, avatarUrl: null, expiresAt: Date.now() + 120000 }
  }, { startDelayMs: 25 })
  const connections: { leave(): Promise<unknown>; connection: { isOpen: boolean } }[] = []
  try {
    await server.listen(0, '127.0.0.1'); const address = server.transport.server!.address(); assert.ok(address && typeof address !== 'string')
    const endpoint = `http://127.0.0.1:${address.port}`
    const urls: string[] = []; server.transport.server!.on('upgrade', req => urls.push(req.url ?? ''))
    const a = await connectLobby('A', undefined, endpoint), b = await connectLobby('B', a.roomId, endpoint); connections.push(a, b)
    for (const lobby of [a, b]) { lobby.onMessage('game_cancelled', () => {}); lobby.onMessage('lobby_error', () => {}) }
    const start = async () => {
      const offerA = new Promise<Reservation>(resolve => a.onMessage('game_reservation', msg => resolve(msg.reservation)))
      const offerB = new Promise<Reservation>(resolve => b.onMessage('game_reservation', msg => resolve(msg.reservation)))
      a.send('set_ready', { ready: true }); b.send('set_ready', { ready: true })
      await until(() => a.state.players.get(a.sessionId)?.ready === true && a.state.players.get(b.sessionId)?.ready === true)
      a.send('start_game')
      const ga = await consumeGameReservation<PongState>(await offerA, endpoint), gb = await consumeGameReservation<PongState>(await offerB, endpoint)
      connections.push(ga, gb); ga.onMessage('game_error', () => {}); gb.onMessage('game_error', () => {})
      await until(() => a.state.status === 'PLAYING' && gb.state?.players?.size === 2)
      assert.equal([...ga.state.players.values()].find(p=>p.username==='Player A')?.side, 'LEFT'); assert.equal([...gb.state.players.values()].find(p=>p.username==='Player B')?.side, 'RIGHT')
      return { ga, gb }
    }
    for (let game = 0; game < 2; game++) {
      const { ga, gb } = await start()
      await until(() => ga.state.phase === 'PLAYING')
      ga.send('set_input', { direction: 1 }); await until(() => gb.state.leftPaddleY > 250)
      ga.send('set_input', { direction: 0 }); const left = ga.state.leftPaddleY
      gb.send('set_input', { direction: -1 }); await until(() => ga.state.rightPaddleY < 250); gb.send('set_input', { direction: 0 })
      assert.ok(left > 250)
      const error = new Promise<{ code: string }>(resolve => ga.onMessage('game_error', resolve))
      ga.send('set_input', { direction: 1, side: 'RIGHT', score: 5 }); assert.equal((await error).code, 'INVALID_INPUT')
      const local = matchMaker.getLocalRoomById(ga.roomId)!.state as PongState
      // Server-side test fixture: position just beyond goal. Clients never receive
      // a mutation API; real production ticks detect/score all five goals.
      for (let point = 1; point <= 5; point++) {
        await until(() => local.phase === 'PLAYING'); local.ballX = 1100
        await until(() => ga.state.leftScore === point && gb.state.leftScore === point)
      }
      await until(() => a.state.status === 'RESULTS' && b.state.status === 'RESULTS')
      assert.equal(a.state.winnerUserId, 'user-A'); assert.equal(a.state.resultReason, 'score')
      assert.deepEqual(JSON.parse(JSON.stringify(a.state.resultPlayers)), JSON.parse(JSON.stringify(b.state.resultPlayers)))
      assert.equal(ga.state.phase, 'FINISHED'); assert.ok(!ga.state.players.has(ga.sessionId)); assert.ok(!gb.state.players.has(gb.sessionId))
      const refused = new Promise<{ code: string }>(resolve => b.onMessage('lobby_error', resolve))
      b.send('return_to_lobby'); assert.equal((await refused).code, 'HOST_REQUIRED')
      assert.equal(b.state.status, 'RESULTS')
      for (const state of [a.state, ga.state]) for (const privateKey of ['expiresAt', 'email', 'authData', 'reservation', 'access_token']) assert.equal(JSON.stringify(state).includes(privateKey), false)
      a.send('return_to_lobby')
      await until(() => a.state.status === 'WAITING' && b.state.status === 'WAITING' && !matchMaker.getLocalRoomById(ga.roomId))
      assert.equal(a.state.winnerUserId, ''); assert.equal(a.state.players.get(a.sessionId)?.ready, false)
      assert.equal(a.state.players.get(b.sessionId)?.ready, false)
    }
    const { ga } = await start(); await ga.leave()
    await until(() => a.state.status === 'RESULTS' && b.state.status === 'RESULTS')
    assert.equal(a.state.winnerUserId, 'user-B'); assert.equal(a.state.resultReason, 'forfeit')
    for (const url of urls) assert.deepEqual([...new URL(url, endpoint).searchParams.keys()], ['sessionId'])
    t.diagnostic('Two score-complete games: private admissions → inputs visible across clients → five server-scored goals → identical RESULTS → WAITING and cleanup; third game proves countdown forfeit.')
  } finally { for (const room of connections) if (room.connection.isOpen) await room.leave().catch(() => {}); await server.gracefullyShutdown(false) }
})

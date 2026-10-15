import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Server, matchMaker } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { schema, t } from '@colyseus/schema'
import { defineGame } from '@chibaskogames/sdk'
import type { GameServerModule } from '@chibaskogames/sdk/server'
import { registerInternalGames } from '../src/games/registerInternalGames.js'
import { createLobbyRoom } from '../src/rooms/LobbyRoom.js'
import { GameSessionCoordinator } from '../src/platform/multiplayer/GameSessionCoordinator.js'
import { serverGameRegistration } from '../src/games/types.js'
import { createProductSession } from '../../lib/multiplayer/productSession.js'

const definition = defineGame({ id: 'test-game', integrationVersion: 1,
  capabilities: { online: { access: ['private'], players: { min: 2, max: 2 } } } })
// Deliberately no players, expectedPlayers, status or gameId in gameplay state.
const State = schema({ question: t.string().default('Answer?'), answer: t.number().default(-1) }, 'FixtureState')
async function until(check: () => boolean) { const end = Date.now() + 5000; while (!check()) { if (Date.now() > end) throw new Error('Fixture deadline'); await delay(10) } }

test('second SDK module has unrelated gameplay state; product metadata and scoreless completion need no platform changes', { timeout: 10000 }, async () => {
  const coordinator = new GameSessionCoordinator()
  let finishOnServer: () => boolean = () => false
  let disposed = 0
  const module: GameServerModule<InstanceType<typeof State>> = {
    definition, tickRate: 30, patchRateMs: 50,
    create(session) {
      const state = new State()
      finishOnServer = () => session.complete({ gameId: definition.id, winnerParticipantId: null,
        reason: 'completed', players: session.participants.map(p => ({ participantId: p.participantId })) })
      return { state, participantJoined() {}, participantLeft() {}, start() {}, tick() {},
        receive(peer, type, payload) {
          if (session.isParticipantActive(peer.participant.participantId) && type === 'answer' && typeof payload === 'number' && Number.isInteger(payload)) state.answer = payload
        },
        dispose() { disposed++ },
      }
    },
  }
  const server = new Server({ transport: new WebSocketTransport(), greet: false, gracefullyShutdown: false })
  server.define('lobby', createLobbyRoom(async token => {
    if (!token) throw new Error('Denied')
    return { userId: token, username: token, avatarUrl: null, expiresAt: Date.now() + 60000 }
  }, coordinator, { registry: new Map([[definition.id, serverGameRegistration(definition, 'test_room')]]), startDelayMs: 10 }))
  registerInternalGames(server, coordinator, [{ roomType: 'test_room', module }])
  let a: ReturnType<typeof createProductSession> | undefined, b: typeof a
  try {
    await server.listen(0, '127.0.0.1')
    const address = server.transport.server!.address(); assert.ok(address && typeof address !== 'string')
    const endpoint = `http://127.0.0.1:${address.port}`, game = { gameId: definition.id, slug: 'test' }
    const controller = (id: string) => createProductSession({ endpoint, getSession: async () => ({ access_token: id, user: { id } }), catalogue: async () => game })
    a = controller('A'); b = controller('B')
    const lobby = await a.connect(game); assert.ok(lobby)
    assert.ok(await b.connect(game, lobby.code))
    a.ready(true); b.ready(true)
    await until(() => a!.getSnapshot().lobby!.players.every(p => p.ready))
    a.start()
    await until(() => a!.getSnapshot().lobby?.status === 'PLAYING' && a!.getSnapshot().game.status === 'READY' && b!.getSnapshot().game.count === 2)
    const ca = a.getGameConnection()!, cb = b.getGameConnection()!
    assert.deepEqual(Object.keys(ca.getState() as object).sort(), ['answer', 'question'])
    const info = ca.getSession()!
    assert.equal(info.session.integrationVersion, 1); assert.equal(info.participants.length, 2)
    assert.equal(info.localParticipantIds[0], ca.localPlayerId)
    assert.doesNotMatch(JSON.stringify(info), /roomId|sessionId|transitionId|userId|reservation|token|email|expiresAt/)
    ca.send('answer', 2); await until(() => (cb.getState() as { answer: number }).answer === 2)
    ca.send('complete', { winnerUserId: 'A' }); assert.equal(a.getSnapshot().lobby?.status, 'PLAYING')
    assert.equal(finishOnServer(), true); assert.equal(finishOnServer(), false)
    await until(() => a!.getSnapshot().lobby?.status === 'RESULTS' && b!.getSnapshot().lobby?.status === 'RESULTS')
    assert.equal(a.getSnapshot().lobby!.result!.winner, '')
    assert.ok(a.getSnapshot().lobby!.result!.players.every(p => p.score === undefined))
    a.returnToLobby()
    await until(() => a!.getSnapshot().lobby?.status === 'WAITING' && disposed === 1)
    ca.send('answer', 99); assert.equal(ca.getState(), null); assert.equal(ca.getSession(), null)
    assert.equal(matchMaker.getLocalRoomById(lobby.code)?.state.status, 'WAITING')
  } finally { a?.disconnect(); b?.disconnect(); await coordinator.shutdown(); await server.gracefullyShutdown(false) }
})

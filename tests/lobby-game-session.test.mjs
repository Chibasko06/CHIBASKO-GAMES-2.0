import test from 'node:test'
import assert from 'node:assert/strict'
import { createLobbyGameSession } from '../lib/lobbyGameSession.ts'
import { consumeGameReservation } from '../lib/gameConnection.ts'

function room() {
  const callbacks = {}
  return { leaves: 0, callbacks, state: {}, async leave() { this.leaves++ },
    onStateChange: fn => { callbacks.change = fn }, onLeave: fn => { callbacks.leave = fn }, onError: fn => { callbacks.error = fn } }
}
const offer = id => ({ transitionId: id, gameId: 'chibasko-pong', reservation: { opaque: true } })
test('private offers are consumed once; cancel closes game connection and stale events do not close a later session', async () => {
  const first = room(), second = room()
  let consumes = 0
  const controller = createLobbyGameSession(() => {}, async () => ++consumes === 1 ? first : second)
  await controller.receive(offer('one'), 'other-game')
  assert.equal(consumes, 0)
  await controller.receive(offer('one'), 'chibasko-pong')
  await controller.receive(offer('one'), 'chibasko-pong')
  assert.equal(consumes, 1)
  controller.cancelled('one'); assert.equal(first.leaves, 1)
  await controller.receive(offer('two'), 'chibasko-pong')
  controller.cancelled('one'); assert.equal(second.leaves, 0)
  controller.dispose(); assert.equal(second.leaves, 1)
})
for (const action of ['close', 'dispose']) test(`${action} closes a game consumption completing late`, async () => {
  const next = room()
  let finish
  const controller = createLobbyGameSession(() => {}, () => new Promise(resolve => { finish = resolve }))
  const pending = controller.receive(offer('one'), 'chibasko-pong')
  controller[action]()
  finish(next); await pending
  assert.equal(next.leaves, 1)
})
test('consumption failure is reported without leaking reservation contents', async () => {
  let failed = false
  const controller = createLobbyGameSession((_room, error) => { failed ||= error }, async () => { throw new Error('private detail') })
  await controller.receive(offer('one'), 'chibasko-pong')
  assert.equal(failed, true)
})
test('reservation consumer rejects arbitrary origins, reconnection tokens and extra fields', async () => {
  for (const reservation of [null, { name: 'pong', roomId: 'room', sessionId: 'seat', processId: 'process', publicAddress: 'outside.invalid' }, { reconnectionToken: 'private' }]) {
    await assert.rejects(consumeGameReservation(reservation))
  }
})

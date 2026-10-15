import test from 'node:test'
import assert from 'node:assert/strict'
import { createLobbyGameSession } from '../lib/lobbyGameSession.ts'
import { consumeGameReservation } from '../lib/gameConnection.ts'
import { readPongView } from '../games/chibasko-pong/client/pongView.ts'

test('Pong view projects public positions and local side, never identity/auth fields', () => {
  const state = { phase:'PLAYING', remainingMs:0,width:1000,height:600,paddleWidth:16,paddleHeight:100,inset:30,radius:10,leftPaddleY:250,rightPaddleY:250,ballX:500,ballY:300,leftScore:1,rightScore:0,players:new Map([['a',{username:'Alice',side:'LEFT',userId:'private-id'}],['b',{username:'Bob',side:'RIGHT',expiresAt:42}]]) }
  const view = readPongView(state,'a'); assert.equal(view.selfSide,'LEFT'); assert.equal(view.leftName,'Alice')
  assert.doesNotMatch(JSON.stringify(view),/private-id|expiresAt|userId|sessionId/)
  assert.equal(readPongView({...state,width:NaN},'a'),null); assert.equal(readPongView({},'a'),null)
})

function room() {
  const callbacks = {}
  return { leaves: 0, callbacks, state: {}, async leave() { this.leaves++ },
    onMessage: (type, fn) => { callbacks[type] = fn }, send() {},
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

test('public game capability handles arbitrary messages/state and expires on cancellation', async () => {
  const next=room();next.sessionId='local-player';const sent=[];next.send=(...args)=>sent.push(args)
  const bridge=createLobbyGameSession(()=>{},async()=>next)
  await bridge.receive(offer('session'),'chibasko-pong')
  const connection=bridge.getConnection();assert.ok(connection)
  let changes=0;const unsubscribe=connection.subscribe(()=>changes++)
  next.state={question:'public'};next.callbacks.change();assert.equal(connection.getState().question,'public');assert.equal(changes,1)
  connection.send('answer',{choice:2});assert.deepEqual(sent,[['__sdk_session'],['answer',{choice:2}]])
  unsubscribe();bridge.cancelled('session');assert.equal(bridge.getConnection(),null)
  connection.send('late',{choice:1});assert.equal(sent.length,2);assert.equal(connection.getState(),null)
})
test('reservation consumer rejects arbitrary origins, reconnection tokens and extra fields', async () => {
  for (const reservation of [null, { name: 'pong', roomId: 'room', sessionId: 'seat', processId: 'process', publicAddress: 'outside.invalid' }, { reconnectionToken: 'private' }]) {
    await assert.rejects(consumeGameReservation(reservation))
  }
})

test('integration metadata maps opaque participants, ignores stale rooms and blocks reserved game messages', async () => {
  const first=room(),second=room(),sent=[]
  first.send=(...args)=>sent.push(args)
  let next=first
  const bridge=createLobbyGameSession(()=>{},async()=>next)
  const metadata={session:{id:'opaque-session',gameId:'chibasko-pong',integrationVersion:1,execution:'online'},
    participants:[{participantId:'participant-A',username:'Alice',avatarUrl:null}],
    localParticipantIds:['participant-A'],connectedParticipantIds:['participant-A'],availability:'ready'}
  await bridge.receive(offer('one'),'chibasko-pong')
  const c=bridge.getConnection();assert.equal(c.localPlayerId,'')
  first.callbacks.__sdk_session(metadata)
  assert.equal(c.localPlayerId,'participant-A');assert.equal(c.getSession().participants.length,1)
  c.send('__sdk_session');c.send('__sdk_future',{fake:true});assert.deepEqual(sent,[['__sdk_session']])
  bridge.cancelled('one');next=second
  await bridge.receive(offer('two'),'chibasko-pong')
  first.callbacks.__sdk_session({...metadata,auth:'private'})
  assert.ok(bridge.getConnection());assert.equal(bridge.getConnection().getSession(),null)
  second.callbacks.__sdk_session({...metadata,participants:[{...metadata.participants[0],email:'private'}]})
  assert.equal(bridge.getConnection(),null);assert.equal(second.leaves,1)
  bridge.dispose()
})

test('missing integration metadata times out, cleans the connection and cannot affect the next session', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  const first=room(),second=room();let next=first,failed=false
  const bridge=createLobbyGameSession((_room,error)=>{failed ||= error},async()=>next)
  await bridge.receive(offer('one'),'chibasko-pong')
  t.mock.timers.tick(10000)
  assert.equal(failed,true);assert.equal(first.leaves,1);assert.equal(bridge.getConnection(),null)
  next=second;await bridge.receive(offer('two'),'chibasko-pong')
  second.callbacks.__sdk_session({session:{id:'new-session',gameId:'chibasko-pong',integrationVersion:1,execution:'online'},
    participants:[{participantId:'A',username:'Alice',avatarUrl:null}],localParticipantIds:['A'],connectedParticipantIds:['A'],availability:'ready'})
  t.mock.timers.tick(20000)
  assert.ok(bridge.getConnection());assert.equal(second.leaves,0)
  bridge.dispose();assert.equal(second.leaves,1)
})

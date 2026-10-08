import test from 'node:test'
import assert from 'node:assert/strict'
import { safeAuthNext, getOAuthRedirectUrl } from '../lib/authRedirect.ts'
import { createProductSession, gameServerOrigin, multiplayerError } from '../lib/multiplayer/productSession.ts'

test('safe return destinations reject external, encoded, protocol and credential destinations', () => {
  for (const next of ['//evil.com','https://evil.com','javascript:alert(1)','/\\evil.com','/%2f%2fevil.com','/games?access_token=secret','/games#token','/\nevil.com']) assert.equal(safeAuthNext(next), '/')
  for (const path of ['/games/chibasko-pong?multiplayer=1','/games/chibasko-pong/lobby/AB7KQ2']) {
    assert.equal(safeAuthNext(path), path)
    assert.equal(new URL(getOAuthRedirectUrl(path)).searchParams.get('next'), path)
  }
})
test('production origin has no localhost fallback and errors never expose provider internals', () => {
  assert.equal(gameServerOrigin('', false), null)
  assert.equal(gameServerOrigin('http://127.0.0.1:2567', false), null)
  assert.equal(gameServerOrigin('', true), 'http://127.0.0.1:2567')
  assert.equal(gameServerOrigin('https://game.chibaskogames.fr', false), 'https://game.chibaskogames.fr')
  assert.equal(gameServerOrigin('https://game.example/?token=secret', false), null)
  assert.equal(multiplayerError(new Error('secret private response')).includes('secret private'), false)
})
test('no session never joins; late join after signout is closed; navigation and cleanup close rooms', async () => {
  const game={slug:'pong',gameId:'chibasko-pong'}
  let calls=0, resolveJoin, left=0
  const missing=createProductSession({endpoint:'http://127.0.0.1:2567',getSession:async()=>null,catalogue:async()=>game,connect:async()=>{calls++}})
  assert.equal(await missing.connect(game), null);assert.equal(calls,0)
  const late=createProductSession({endpoint:'http://127.0.0.1:2567',getSession:async()=>({access_token:'test-token',user:{id:'A'}}),catalogue:async()=>game,connect:()=>new Promise(resolve=>{resolveJoin=resolve})})
  const pending=late.connect(game);await new Promise(resolve=>setImmediate(resolve))
  late.accountChanged(null)
  resolveJoin({leave:async()=>{left++}})
  assert.equal(await pending,null);assert.equal(left,1);assert.equal(late.getSnapshot().lobby,null)
})

test('active session survives route handoff and closes on other context, account change and global cleanup',async()=>{
  const game={slug:'pong',gameId:'chibasko-pong'}
  for(const cleanup of ['navigation','account','unmount']){
    let left=0,removed=0
    const room={sessionId:'temporary',state:{code:'AB7KQ2',status:'WAITING',hostUserId:'A',gameId:game.gameId,minPlayers:2,maxPlayers:2,players:new Map([['temporary',{userId:'A',username:'Alice',avatarUrl:'',ready:false}]])},onStateChange(){},onMessage(){},onError(){},onLeave(){},removeAllListeners(){removed++},leave:async()=>{left++},send(){}}
    const c=createProductSession({endpoint:'http://127.0.0.1:2567',getSession:async()=>({access_token:'test-token',user:{id:'A'}}),catalogue:async()=>game,connect:async()=>room})
    c.navigate('/games/pong');assert.ok(await c.connect(game))
    c.navigate('/games/pong/lobby/AB7KQ2');assert.ok(c.getSnapshot().lobby);assert.equal(left,0)
    if(cleanup==='navigation')c.navigate('/games/other');else if(cleanup==='account')c.accountChanged('B');else c.disconnect()
    assert.equal(c.getSnapshot().lobby,null);assert.equal(left,1);assert.equal(removed,1)
  }
})

test('connection timeout closes a late successful admission',async t=>{
  t.mock.timers.enable({apis:['setTimeout']})
  let resolveJoin,left=0
  const c=createProductSession({endpoint:'http://127.0.0.1:2567',getSession:async()=>({access_token:'test-token',user:{id:'A'}}),catalogue:async()=>null,connect:()=>new Promise(resolve=>{resolveJoin=resolve})})
  const pending=c.connect({slug:'pong',gameId:'chibasko-pong'})
  await new Promise(resolve=>setImmediate(resolve))
  t.mock.timers.tick(15001)
  assert.equal(await pending,null);assert.match(c.getSnapshot().error,/trop de temps/)
  resolveJoin({leave:async()=>{left++}});await new Promise(resolve=>setImmediate(resolve))
  assert.equal(left,1);t.mock.timers.reset()
})

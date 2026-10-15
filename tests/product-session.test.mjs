import test from 'node:test'
import assert from 'node:assert/strict'
import { safeAuthNext, getOAuthRedirectUrl } from '../lib/authRedirect.ts'
import { createProductSession, gameServerOrigin, multiplayerError } from '../lib/multiplayer/productSession.ts'
import { JSDOM } from 'jsdom'
import { protectLobbyNavigation, analyticsId } from '../lib/multiplayer/analyticsPrivacy.ts'
import { fetchPublicLobbies } from '../lib/multiplayer/publicLobbies.ts'

test('public discovery uses fresh HTTP auth only, strips extra fields and rejects malformed responses',async()=>{
  const original=globalThis.fetch,calls=[]
  const summary={code:'ABCDEF',gameId:'test-game',host:{username:'Alice',avatarUrl:null,userId:'private'},currentPlayers:1,maxPlayers:2,reservation:'private'}
  try{
    globalThis.fetch=async(url,init)=>{calls.push([url,init]);return Response.json({lobbies:[summary]})}
    const data=await fetchPublicLobbies('https://game.example','test-game','test-token')
    assert.deepEqual(data,[{code:'ABCDEF',gameId:'test-game',host:{username:'Alice',avatarUrl:null},currentPlayers:1,maxPlayers:2}])
    assert.equal(calls[0][0].search,'?gameId=test-game');assert.equal(calls[0][0].href.includes('test-token'),false)
    assert.equal(calls[0][1].headers.Authorization,'Bearer test-token');assert.equal(calls[0][1].cache,'no-store')
    summary.currentPlayers=2;await assert.rejects(fetchPublicLobbies('https://game.example','test-game','test-token'),/UNAVAILABLE/)
    globalThis.fetch=async()=>Response.json({error:'secret raw error'},{status:401})
    await assert.rejects(fetchPublicLobbies('https://game.example','test-game','test-token'),/AUTH_REQUIRED/)
    globalThis.fetch=async()=>new Response('<html>proxy detail</html>',{status:502})
    await assert.rejects(fetchPublicLobbies('https://game.example','test-game','test-token'),/UNAVAILABLE/)
  }finally{globalThis.fetch=original}
})

test('public listing aborts during session refresh and invalidates a response after account change',async()=>{
  let finish
  const controller=createProductSession({endpoint:'https://game.example',getSession:()=>new Promise(resolve=>{finish=resolve}),catalogue:async()=>null})
  const request=new AbortController(),pending=controller.listPublic('test-game',request.signal)
  request.abort();await assert.rejects(pending,{name:'AbortError'})
  finish(null)
  const original=globalThis.fetch;let answer
  const c=createProductSession({endpoint:'https://game.example',getSession:async()=>({access_token:'fresh',user:{id:'A'}}),catalogue:async()=>null})
  c.accountChanged('A')
  try{
    globalThis.fetch=()=>new Promise(resolve=>{answer=resolve})
    const list=c.listPublic('test-game');await new Promise(resolve=>setImmediate(resolve))
    c.accountChanged('B');answer(Response.json({lobbies:[]}));await assert.rejects(list,{name:'AbortError'})
    assert.equal(c.getSnapshot().lobby,null);assert.equal(c.getSnapshot().busy,false)
  }finally{globalThis.fetch=original;c.disconnect();controller.disconnect()}
})

test('local result outcome uses server identities rather than names and exposes no raw IDs',async()=>{
  let refresh
  const state={code:'AB7KQ2',status:'WAITING',hostUserId:'A',minPlayers:2,maxPlayers:2,players:new Map([['seat',{userId:'A',username:'Same',avatarUrl:'',ready:false}]])}
  const room={sessionId:'seat',state,onStateChange(fn){refresh=fn},onMessage(){},onError(){},onLeave(){},removeAllListeners(){},async leave(){}}
  const controller=createProductSession({endpoint:'http://127.0.0.1:2567',getSession:async()=>({access_token:'mock',user:{id:'A'}}),catalogue:async()=>null,connect:async()=>room})
  try{
    await controller.connect({slug:'fixture',gameId:'test-game'})
    Object.assign(state,{status:'RESULTS',winnerUserId:'B',resultReason:'score',resultPlayers:new Map([['A',{userId:'A',username:'Same',score:3,hasScore:true}],['B',{userId:'B',username:'Same',score:5,hasScore:true}]])})
    refresh();assert.equal(controller.getSnapshot().lobby.result.outcome,'loss')
    state.winnerUserId='A';refresh();assert.equal(controller.getSnapshot().lobby.result.outcome,'win')
    state.winnerUserId='';refresh();assert.equal(controller.getSnapshot().lobby.result.outcome,undefined)
    assert.doesNotMatch(JSON.stringify(controller.getSnapshot().lobby.result),/userId|sessionId|access_token/)
  }finally{controller.disconnect()}
})

test('analytics is disabled before history listeners observe private lobby URLs and guards are removed',()=>{
  const dom=new JSDOM('',{url:'https://chibaskogames.fr/multiplayer'})
  const win=dom.window, observed=[]
  const original=win.history.pushState
  win.history.pushState=function(...args){observed.push(win[`ga-disable-${analyticsId}`]);return original.apply(this,args)}
  const before=win.history.pushState
  const cleanup=protectLobbyNavigation(win)
  win.history.pushState(null,'','/games/pong/lobby/AB7KQ2')
  assert.equal(observed[0],true)
  win[`ga-disable-${analyticsId}`]=false
  win.history.pushState(null,'','/games/pong')
  assert.equal(observed[1],true,'outgoing private referrer is also suppressed')
  cleanup();assert.equal(win.history.pushState,before);dom.window.close()
})

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
    await new Promise(resolve=>setImmediate(resolve))
    assert.equal(c.getSnapshot().lobby,null);assert.equal(left,1);assert.equal(removed,1)
  }
})

test('returning from the lobby to its game closes the connection, without dropping closing handlers',async()=>{
  let finish, removed=false
  const game={slug:'pong',gameId:'chibasko-pong'}
  const room={sessionId:'seat',state:{code:'AB7KQ2',status:'WAITING',hostUserId:'A',minPlayers:2,maxPlayers:2,players:new Map()},onStateChange(){},onMessage(){},onError(){},onLeave(){},removeAllListeners(){removed=true},leave:()=>new Promise(resolve=>{finish=resolve})}
  const controller=createProductSession({endpoint:'http://127.0.0.1:2567',getSession:async()=>({access_token:'test',user:{id:'A'}}),catalogue:async()=>game,connect:async()=>room})
  controller.navigate('/games/pong');await controller.connect(game)
  controller.navigate('/games/pong/lobby/AB7KQ2');assert.ok(controller.getSnapshot().lobby)
  controller.navigate('/games/pong');assert.equal(controller.getSnapshot().lobby,null)
  assert.equal(removed,false)
  finish(1000);await new Promise(resolve=>setImmediate(resolve));assert.equal(removed,true)
})

test('stopped game server yields a safe unavailable message and permits a new attempt',async()=>{
  const controller=createProductSession({endpoint:'http://127.0.0.1:2567',getSession:async()=>({access_token:'test',user:{id:'A'}}),catalogue:async()=>null,connect:async()=>{throw new TypeError('fetch failed')}})
  assert.equal(await controller.connect({slug:'pong',gameId:'chibasko-pong'}),null)
  assert.equal(controller.getSnapshot().busy,false)
  assert.equal(controller.getSnapshot().unavailable,true)
  assert.equal(controller.getSnapshot().error,'Le multijoueur de Chibasko Games est temporairement indisponible.')
  controller.retry();assert.equal(controller.getSnapshot().unavailable,false)
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

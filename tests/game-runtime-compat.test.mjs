import test from 'node:test'
import assert from 'node:assert/strict'
import {setImmediate as flush} from 'node:timers/promises'
import {randomUUID} from 'node:crypto'
import {JSDOM} from 'jsdom'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {createGameBridge} from '../lib/game-runtime/bridge.ts'
import {mountGameRuntime} from '../lib/game-runtime/controller.ts'
import {runtimePolicy} from '../lib/game-runtime/contracts.ts'
import {gameLaunchRequest} from '../lib/server/gameLaunches.ts'

async function waitFor(predicate){
  const deadline=performance.now()+5000
  while(!predicate() && performance.now()<deadline)await flush()
  assert.ok(predicate(),'Expected asynchronous fixture operation to settle')
}

async function peer(t,policy={}) {
  const h=await runtimeHarness(),{descriptor}=await h.client.create(h.request),dom=new JSDOM('',{url:'https://portal.test',pretendToBeVisual:true})
  const sent=[],phases=[],failures=[],documentId=randomUUID();let autoPong=true,hidden=false
  Object.defineProperty(dom.window.document,'hidden',{get:()=>hidden})
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:Date.now()})
  const source={postMessage(data,origin){sent.push({data,origin});if(autoPong && data.type==='PLATFORM_PING')emit('GAME_PONG',{sequence:data.payload.sequence})}}
  const bridge=createGameBridge({host:dom.window,source:()=>source,descriptor,onPhase:p=>phases.push(p),onFailure:c=>failures.push(c),onLeave(){},policy})
  function emit(type,payload={},overrides={}){dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source,origin:descriptor.contentOrigin,data:{channel:'chibasko.game',protocolVersion:1,launchId:descriptor.launchId,generation:descriptor.generation,type,payload:{documentId,...payload},...overrides}}))}
  t.after(()=>{bridge.dispose();dom.window.close()})
  return {bridge,emit,sent,phases,failures,setPong(value){autoPong=value},setHidden(value){hidden=value;dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'))}}
}

test('separate HELLO and INIT acknowledgement budgets; no SDK is not a slow game',async t=>{
  const p=await peer(t);p.bridge.loaded();t.mock.timers.tick(14999);assert.deepEqual(p.failures,[])
  t.mock.timers.tick(1);assert.deepEqual(p.failures,['hello_timeout'])
})
test('HELLO followed by no INIT acknowledgement fails the short handshake only',async t=>{
  const p=await peer(t);p.setPong(false);p.emit('GAME_HELLO');t.mock.timers.tick(5000)
  assert.deepEqual(p.failures,['handshake_timeout'])
})
test('long engine preparation answers heartbeat, stays loading past 30 seconds, then starts at READY',async t=>{
  const p=await peer(t);p.bridge.loaded();p.emit('GAME_HELLO');t.mock.timers.tick(90_000)
  assert.deepEqual(p.failures,[]);assert.deepEqual(p.phases,[])
  assert.ok(p.sent.filter(m=>m.data.type==='PLATFORM_PING').length>=9)
  p.emit('GAME_READY');assert.deepEqual(p.phases,['ready','running'])
  p.emit('GAME_READY');assert.deepEqual(p.phases,['ready','running'])
})
test('a live engine cannot extend the fixed READY deadline indefinitely',async t=>{
  const p=await peer(t);p.emit('GAME_HELLO');t.mock.timers.tick(600_000)
  assert.deepEqual(p.failures,['game_ready_timeout'])
})
test('a dead bridge while loading is distinguished from the READY timeout',async t=>{
  const p=await peer(t);p.emit('GAME_HELLO');p.setPong(false);for(let i=0;i<4;i++)t.mock.timers.tick(10_000)
  assert.deepEqual(p.failures,['bridge_lost']);assert.deepEqual(p.phases,[])
})
test('stale generation cannot connect or keep loading alive; teardown clears all budgets',async t=>{
  const p=await peer(t);p.bridge.loaded();p.emit('GAME_HELLO',{}, {generation:randomUUID()});assert.equal(p.sent.length,0)
  p.bridge.dispose();t.mock.timers.tick(1_000_000);p.emit('GAME_HELLO');assert.deepEqual(p.failures,[]);assert.equal(p.sent.length,0)
})
test('a hidden launch still acknowledges INIT; normal loading heartbeat pauses until visible',async t=>{
  const p=await peer(t);p.setHidden(true);p.emit('GAME_HELLO')
  t.mock.timers.tick(90_000);assert.deepEqual(p.failures,[])
  assert.equal(p.sent.filter(m=>m.data.type==='PLATFORM_PING').length,1)
  p.setHidden(false);assert.equal(p.sent.filter(m=>m.data.type==='PLATFORM_PING').length,2)
  p.emit('GAME_READY');assert.deepEqual(p.phases,['ready','running'])
})
test('runtime timer configuration is platform-controlled and bounded',()=>{
  assert.equal(runtimePolicy().gameReadyMs,600_000)
  for(const input of [{gameReadyMs:Infinity},{gameReadyMs:1_800_001},{loadMs:0},{handshakeMs:NaN}])assert.throws(()=>runtimePolicy(input),/invalid_runtime_policy/)
})

async function mounted(t,audience='published',adapt=client=>client,policy={}) {
  const h=await runtimeHarness('solo',audience),dom=new JSDOM('<div></div>',{url:'https://portal.test',pretendToBeVisual:true}),states=[]
  let releaseDone;const revoked=new Promise(resolve=>{releaseDone=resolve})
  const client=adapt({...h.client,async release(handle){await h.client.release(handle);releaseDone()}})
  t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:Date.now()})
  const runtime=mountGameRuntime({container:dom.window.document.querySelector('div'),request:h.request,client,onState:s=>states.push(s),onLeave(){},policy})
  t.after(()=>{runtime.dispose();dom.window.close()})
  await waitFor(()=>!!dom.window.document.querySelector('iframe'))
  const frame=dom.window.document.querySelector('iframe');assert.ok(frame)
  const url=new URL(frame.src),hash=new URLSearchParams(url.hash.slice(1)),documentId=randomUUID()
  const emit=(type,payload={})=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source:frame.contentWindow,origin:url.origin,data:{channel:'chibasko.game',protocolVersion:1,launchId:hash.get('cgLaunch'),generation:hash.get('cgGeneration'),type,payload:{documentId,...payload}}}))
  frame.contentWindow.postMessage=m=>{if(m.type==='PLATFORM_PING')emit('GAME_PONG',{sequence:m.payload.sequence})}
  emit('GAME_HELLO');emit('GAME_READY');assert.equal(states.at(-1).phase,'running')
  return {h,dom,states,runtime,frame,url,revoked}
}
for(const audience of ['published','preview'])test('45-minute '+audience+' session renews the same origin and still streams lazy assets',async t=>{
  const {h,dom,states,runtime,frame,url,revoked}=await mounted(t,audience)
  // WebCrypto runs outside fake timers; finish each renewal before advancing again.
  for(let i=0;i<9;i++){t.mock.timers.tick(300_000);await waitFor(()=>h.calls.filter(c=>c==='distribution_renew_launch').length>=i+1);await flush()}
  assert.equal(states.at(-1).phase,'running');assert.equal(dom.window.document.querySelector('iframe'),frame)
  assert.equal(h.sessions.size,1);assert.ok(h.calls.filter(c=>c==='distribution_renew_launch').length>=9)
  const asset=await h.gateway(new Request(url.origin+'/asset.data'));assert.equal(asset.status,200);assert.deepEqual([...new Uint8Array(await asset.arrayBuffer())],[1,2,3,4])
  runtime.dispose();await revoked;assert.equal((await h.gateway(new Request(url.origin+'/asset.data'))).status,403)
})

test('transient renewal failure retries without extending the lease locally or replacing the iframe',async t=>{
  let attempts=0
  const {h,states,frame,dom,runtime}=await mounted(t,'published',base=>({...base,async renew(...args){if(++attempts===1)throw new Error('temporary');return base.renew(...args)}}),{leaseRenewMs:1000,leaseRetryMs:100})
  const initial=[...h.sessions.values()][0].expires_at
  t.mock.timers.tick(1000);await flush();assert.equal(attempts,1);assert.equal([...h.sessions.values()][0].expires_at,initial)
  t.mock.timers.tick(100);await flush();await flush();assert.equal(attempts,2);assert.equal(states.at(-1).phase,'running');assert.equal(dom.window.document.querySelector('iframe'),frame)
  runtime.dispose();t.mock.timers.tick(5000);assert.equal(attempts,2)
})
test('renewal timeout aborts, retries, and ignores a late response from its timed-out attempt',async t=>{
  let attempts=0,late,aborted=false
  const {states}=await mounted(t,'published',base=>({...base,renew(handle,signal){if(++attempts===1){signal.addEventListener('abort',()=>{aborted=true});return new Promise(resolve=>{late=resolve})}return base.renew(handle,signal)}}),{leaseRenewMs:1000,leaseRetryMs:100,leaseRequestMs:50})
  t.mock.timers.tick(1000);await flush();t.mock.timers.tick(50);await flush();assert.equal(aborted,true)
  t.mock.timers.tick(100);await flush();await flush();assert.equal(attempts,2)
  late({launchId:randomUUID(),generation:randomUUID(),expiresAt:new Date(0).toISOString()});await flush();assert.equal(states.at(-1).phase,'running')
})
test('a renewed lease for another generation fails closed and revokes this launch',async t=>{
  const {states,h,dom,revoked}=await mounted(t,'published',base=>({...base,async renew(...args){return {...await base.renew(...args),generation:randomUUID()}}}),{leaseRenewMs:1000})
  t.mock.timers.tick(1000);await waitFor(() => states.at(-1).error === 'invalid_lease');assert.equal(states.at(-1).error,'invalid_lease');assert.equal(dom.window.document.querySelector('iframe'),null)
  await revoked;assert.equal(h.released.length,1)
})

test('renewal requires portal control, keeps generation, rechecks rights and cannot revive expired/revoked launches',async()=>{
  const h=await runtimeHarness('solo','preview'),handle=await h.client.create(h.request),deps={actor:async()=>null,service:()=>h.service}
  const request=control=>new Request('https://portal.test/api/game-launches/'+handle.descriptor.launchId,{method:'PATCH',headers:{Origin:'https://portal.test','Content-Type':'application/json'},body:JSON.stringify({controlToken:control})})
  assert.equal((await gameLaunchRequest(request('0'.repeat(64)),handle.descriptor.launchId,deps)).status,403)
  h.clock.offset=300_000
  const response=await gameLaunchRequest(request(handle.controlToken),handle.descriptor.launchId,deps),{data}=await response.json()
  assert.equal(response.status,200);assert.equal(data.generation,handle.descriptor.generation);assert.ok(Date.parse(data.expiresAt)>Date.parse(handle.descriptor.expiresAt))
  assert.deepEqual(Object.keys(data).sort(),['expiresAt','generation','launchId'])
  h.members.delete('owner');assert.equal((await gameLaunchRequest(request(handle.controlToken),handle.descriptor.launchId,deps)).status,403)
  h.members.add('owner');await h.client.release(handle);await assert.rejects(h.client.renew(handle),/launch_expired/)
  const expired=await h.client.create(h.request);h.clock.offset+=1_800_001;await assert.rejects(h.client.renew(expired),/launch_expired/)
})

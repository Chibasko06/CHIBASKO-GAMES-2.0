import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {JSDOM} from 'jsdom'
import {runtimeHarness,runtimeConfig} from './helpers/runtime-harness.mjs'
import {validateLaunchConfiguration,launchService} from '../lib/game-distribution/gateway/launch.ts'
import {gameLaunchRequest} from '../lib/server/gameLaunches.ts'
import {createGameBridge} from '../lib/game-runtime/bridge.ts'
import {mountGameRuntime,validateLaunchHandle,IFRAME_SANDBOX} from '../lib/game-runtime/controller.ts'
import {safeContext,validGameMessage} from '../lib/game-runtime/contracts.ts'

for(const kind of ['pong-like','solo','online'])for(const audience of ['published','preview'])test(kind+' / '+audience+' uses cookie-free isolated immutable artifacts and safe descriptors',async()=>{
  const h=await runtimeHarness(kind,audience),a=await h.client.create(h.request),b=await h.client.create(h.request)
  assert.notEqual(a.descriptor.contentOrigin,b.descriptor.contentOrigin)
  validateLaunchHandle(a,h.request,'https://portal.test')
  assert.ok(a.descriptor.entrypointUrl.endsWith(kind==='solo'?'/play/start.html':'/index.html'))
  assert.doesNotMatch(JSON.stringify(a.descriptor.context),/supabase|authorization|roomId|reservation|email|cookie|token|storage/i)
  const r=await h.gateway(new Request(a.descriptor.entrypointUrl))
  assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),null);assert.equal(r.headers.get('cache-control'),'private, no-store');await r.body.cancel()
  const asset=await h.gateway(new Request(a.descriptor.contentOrigin+'/asset.data',{method:'HEAD'}));assert.equal(asset.status,200);assert.equal(asset.body,null)
  await h.client.release(a);assert.equal((await h.gateway(new Request(a.descriptor.entrypointUrl))).status,403)
  assert.doesNotMatch(JSON.stringify(h.logs),new RegExp(new URL(a.descriptor.contentOrigin).hostname+'|'+a.controlToken))
})
test('authorization, IDOR, expiry, permission revocation, no caller-injected online identity and PSL fail-closed',async()=>{
  const h=await runtimeHarness('solo','preview')
  await assert.rejects(h.service.create(null,h.request),/unauthorized/)
  await assert.rejects(h.service.create('stranger',h.request),/preview_forbidden/)
  await assert.rejects(h.service.create('owner',{...h.request,gameId:randomUUID()}),/version_not_found/)
  const a=await h.client.create(h.request);h.members.delete('owner')
  assert.equal((await h.gateway(new Request(a.descriptor.entrypointUrl))).status,403)
  h.members.add('owner');for(const s of h.sessions.values())s.expires_at=new Date(0).toISOString()
  assert.equal((await h.gateway(new Request(a.descriptor.entrypointUrl))).status,403)
  const online=await runtimeHarness('online')
  await assert.rejects(launchService(online.db,runtimeConfig).create('owner',online.request),/online_session_required/)
  await assert.rejects(launchService(online.db,runtimeConfig,async()=>({gameId:'wrong',email:'private'})).create('owner',online.request),/invalid_launch_context/)
  assert.throws(()=>validateLaunchConfiguration({...runtimeConfig,contentBase:'games-content.example'}),/content_cookie_boundary_required/)
  assert.equal(safeContext({gameId:h.request.gameId,gameVersionId:h.request.gameVersionId,execution:'local',locale:'fr',participants:[],email:'private'}),false)
})
test('launch API accepts anonymous published local, refuses injected fields/foreign origin and revokes with portal control only',async()=>{
  const h=await runtimeHarness(),deps={actor:async()=>null,service:()=>h.service}
  const make=body=>new Request('https://portal.test/api/game-launches',{method:'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json'},body:JSON.stringify(body)})
  const response=await gameLaunchRequest(make(h.request),undefined,deps),{data}=await response.json();assert.equal(response.status,201)
  assert.equal((await gameLaunchRequest(make({...h.request,participantId:'forged'}),undefined,deps)).status,400)
  const foreign=make(h.request);foreign.headers.set('Origin','https://evil.test');assert.equal((await gameLaunchRequest(foreign,undefined,deps)).status,403)
  assert.equal((await gameLaunchRequest(make({controlToken:'f'.repeat(64)}),data.descriptor.launchId,deps)).status,403)
  assert.equal((await gameLaunchRequest(make({controlToken:data.controlToken}),data.descriptor.launchId,deps)).status,204)
})
test('bridge validates source/origin/schema/version/generation, orders handshake, ignores duplicates and detaches',async(t)=>{
  const h=await runtimeHarness(),{descriptor}=await h.client.create(h.request),dom=new JSDOM('',{url:'https://portal.test',pretendToBeVisual:true}),host=dom.window
  const sent=[],phases=[],failures=[],source={postMessage:(data,origin)=>sent.push({data,origin})},doc=randomUUID()
  const bridge=createGameBridge({host,source:()=>source,descriptor,onPhase:p=>phases.push(p),onFailure:e=>failures.push(e),onLeave(){}})
  t.after(()=>{bridge.dispose();dom.window.close()})
  const hello={channel:'chibasko.game',protocolVersion:1,launchId:descriptor.launchId,generation:descriptor.generation,type:'GAME_HELLO',payload:{documentId:doc}}
  const emit=(data=hello,origin=descriptor.contentOrigin,src=source)=>host.dispatchEvent(new host.MessageEvent('message',{data,origin,source:src}))
  emit(hello,'https://evil.test');emit(hello,descriptor.contentOrigin,{});emit({...hello,protocolVersion:2});emit({...hello,generation:randomUUID()});emit({...hello,extra:'unexpected'})
  assert.equal(sent.length,0)
  emit();emit();assert.equal(sent.length,2);assert.equal(sent[0].data.type,'PLATFORM_INIT');assert.equal(sent[1].data.type,'PLATFORM_PING');assert.equal(sent[0].origin,descriptor.contentOrigin)
  emit({...hello,type:'GAME_READY'});emit({...hello,type:'GAME_READY'});assert.deepEqual(phases,['ready','running'])
  assert.equal(validGameMessage({...hello,payload:{documentId:doc,jwt:'forbidden'}}),false)
  emit({...hello,payload:{documentId:randomUUID()}});assert.deepEqual(failures,['unexpected_navigation'])
  const count=sent.length;emit();bridge.dispose();assert.equal(sent.length,count);dom.window.close()
})
test('descriptor timeout and teardown release late generations even when resolver ignores abort',async()=>{
  const h=await runtimeHarness(),dom=new JSDOM('<div id="root"></div>',{url:'https://portal.test'}),states=[],released=[]
  let resolve
  const client={create:()=>new Promise(r=>{resolve=r}),release:async h=>released.push(h.descriptor.launchId)}
  const controller=mountGameRuntime({container:dom.window.document.querySelector('#root'),request:h.request,client,onState:s=>states.push(s),onLeave(){},policy:{descriptorMs:10}})
  await new Promise(r=>setTimeout(r,30));assert.equal(states.at(-1).error,'descriptor_timeout')
  const handle=await h.client.create(h.request);resolve(handle);await new Promise(r=>setTimeout(r,5));assert.deepEqual(released,[handle.descriptor.launchId])
  controller.dispose();assert.equal(dom.window.document.querySelectorAll('iframe').length,0)
  assert.ok(!IFRAME_SANDBOX.includes('allow-top-navigation'));assert.ok(!IFRAME_SANDBOX.includes('allow-popups'));dom.window.close()
})
test('handshake timeout, missing heartbeat and visibility stop/resume are bounded and cleaned',async(t)=>{
  const h=await runtimeHarness(),{descriptor}=await h.client.create(h.request),dom=new JSDOM('',{url:'https://portal.test',pretendToBeVisual:true}),host=dom.window
  let hidden=false;Object.defineProperty(host.document,'hidden',{get:()=>hidden})
  const sent=[],failures=[],phases=[],source={postMessage:m=>sent.push(m)},documentId=randomUUID()
  const message=type=>({channel:'chibasko.game',protocolVersion:1,launchId:descriptor.launchId,generation:descriptor.generation,type,payload:{documentId}})
  const emit=type=>host.dispatchEvent(new host.MessageEvent('message',{source,origin:descriptor.contentOrigin,data:message(type)}))
  const a=createGameBridge({host,source:()=>source,descriptor,onPhase:p=>phases.push(p),onFailure:c=>failures.push(c),onLeave(){},policy:{helloMs:10,handshakeMs:10,pingMs:5,pongMs:15}})
  t.after(()=>a.dispose())
  a.loaded();await new Promise(r=>setTimeout(r,25));assert.deepEqual(failures,['hello_timeout']);a.dispose()
  const b=createGameBridge({host,source:()=>source,descriptor,onPhase:p=>phases.push(p),onFailure:c=>failures.push(c),onLeave(){},policy:{handshakeMs:30,pingMs:5,pongMs:15}})
  t.after(()=>{b.dispose();dom.window.close()})
  emit('GAME_HELLO');emit('GAME_READY');hidden=true;host.document.dispatchEvent(new host.Event('visibilitychange'))
  assert.equal(sent.at(-1).type,'GAMEPLAY_STOP');await new Promise(r=>setTimeout(r,25));assert.equal(failures.length,1)
  hidden=false;host.document.dispatchEvent(new host.Event('visibilitychange'))
  assert.ok(sent.some(m=>m.type==='PLATFORM_PING'));await new Promise(r=>setTimeout(r,45));assert.deepEqual(failures,['hello_timeout','bridge_lost'])
})
test('load/handshake timeout and unmount before late descriptor never mount stale iframe or retain listeners',async(t)=>{
  const h=await runtimeHarness(),dom=new JSDOM('<div id="root"></div>',{url:'https://portal.test'}),states=[]
  const runtime=mountGameRuntime({container:dom.window.document.querySelector('#root'),request:h.request,client:h.client,onState:s=>states.push(s),onLeave(){},policy:{loadMs:10,helloMs:10,handshakeMs:10}})
  t.after(()=>{runtime.dispose();dom.window.close()})
  for(let i=0;i<200 && states.at(-1)?.phase!=='failed';i++)await new Promise(r=>setTimeout(r,5))
  assert.ok(['iframe_load_timeout','hello_timeout','handshake_timeout'].includes(states.at(-1).error));runtime.dispose();dom.window.close()
  const next=new JSDOM('<div></div>',{url:'https://portal.test'});let resolve;const released=[]
  const controller=mountGameRuntime({container:next.window.document.querySelector('div'),request:h.request,client:{create:()=>new Promise(r=>{resolve=r}),release:async h=>released.push(h.descriptor.launchId)},onState:s=>states.push(s),onLeave(){}})
  controller.dispose();const count=states.length,handle=await h.client.create(h.request);resolve(handle);await new Promise(r=>setTimeout(r,10))
  assert.equal(states.length,count);assert.equal(next.window.document.querySelectorAll('iframe').length,0);assert.deepEqual(released,[handle.descriptor.launchId]);next.window.close()
})

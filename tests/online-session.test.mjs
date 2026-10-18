import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,createHash} from 'node:crypto'
import {JSDOM} from 'jsdom'
import {onlineSessionService,gameplayEndpoint} from '../lib/online-session/service.ts'
import {onlineRequest} from '../lib/server/onlineSessions.ts'
import {createGameBridge} from '../lib/game-runtime/bridge.ts'
import {runtimeHarness} from './helpers/runtime-harness.mjs'

test('production endpoints come from deployment, require TLS and reject local/IP/credential/query/scheme injection',()=>{
 for(const url of ['wss://multiplayer.chibaskogames.fr/game','https://signal.chibaskogames.fr/'])assert.equal(gameplayEndpoint(url),url)
 for(const url of ['javascript:alert(1)','data:text/html,hi','file:///a','http://host.com','ws://host.com','wss://localhost','https://127.0.0.1','https://10.0.0.1','https://[::1]','https://a.internal',['https:', '//', 'fixture', ':', 'fixture', '@', 'host.com'].join(''),'https://host.com/?ticket=secret'])assert.throws(()=>gameplayEndpoint(url))
})
test('START issues 256-bit randomness and sends only hashes to storage; exchange authenticates independently',async()=>{
 const calls=[],session='s_'+'1'.repeat(32),participant='p_'+'2'.repeat(32)
 const db={async call(name,args){calls.push({name,args});if(name==='distribution_issue_connection_ticket')return {execution:'online',online:{onlineSessionId:session,participantId:participant,server:{endpoint:'wss://gameplay.chibaskogames.fr/',expiresAt:new Date(Date.now()+180000).toISOString()}}};return {data:{gameId:randomUUID(),gameVersionId:randomUUID(),onlineSessionId:session,participant:{id:participant,displayName:'Player'}}}}}
 const service=onlineSessionService(db),control='c'.repeat(64),generation=randomUUID(),launch=randomUUID()
 const a=await service.start(launch,control,generation),b=await service.start(launch,control,generation)
 assert.notEqual(a.online.server.ticket,b.online.server.ticket);assert.match(a.online.server.ticket,/^[a-f0-9]{64}$/)
 assert.equal(calls[0].args.p_ticket_hash,createHash('sha256').update(a.online.server.ticket).digest('hex'))
 assert.ok(!JSON.stringify(calls).includes(a.online.server.ticket));assert.ok(!JSON.stringify(calls).includes(control))
 await service.exchange('d'.repeat(64),a.online.server.ticket,randomUUID());assert.ok(!JSON.stringify(calls).includes('d'.repeat(64)))
 const bad=onlineSessionService({call:async()=>({error:{code:'ticket_replayed'}})})
 await assert.rejects(bad.exchange('d'.repeat(64),'a'.repeat(64),randomUUID()),/ticket_replayed/)
})
test('exchange HTTP returns stable errors without echoing request, SQL or infrastructure',async()=>{
 const prior=process.env.GAME_RUNTIME_LAUNCHES_ENABLED;process.env.GAME_RUNTIME_LAUNCHES_ENABLED='1'
 try {
  const request=()=>new Request('https://portal.test/api/game-server/v1/tickets/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket:'a'.repeat(64),requestId:randomUUID()})})
  const logs=[]
  const r=await onlineRequest(request(),undefined,()=>onlineSessionService({call:async()=>{throw Error('sensitive DB infrastructure')}}),event=>logs.push(event))
  assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:{code:'invalid_credential'}})
  assert.equal(logs[0].code,'invalid_credential');assert.ok(!JSON.stringify(logs).includes('a'.repeat(64)))
 }finally{if(prior===undefined)delete process.env.GAME_RUNTIME_LAUNCHES_ENABLED;else process.env.GAME_RUNTIME_LAUNCHES_ENABLED=prior}
})

async function peer(t,contextProvider){
 const h=await runtimeHarness('online'),{descriptor}=await h.client.create(h.request),dom=new JSDOM('',{url:'https://portal.test',pretendToBeVisual:true})
 const sent=[],failures=[],source={postMessage:m=>sent.push(m)},documentId=randomUUID(),phases=[]
 const bridge=createGameBridge({host:dom.window,source:()=>source,descriptor,getStartContext:contextProvider?()=>contextProvider(descriptor):undefined,onFailure:c=>failures.push(c),onPhase:p=>phases.push(p),onLeave(){}})
 const emit=(type,override={})=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{origin:descriptor.contentOrigin,source,data:{channel:'chibasko.game',protocolVersion:2,launchId:descriptor.launchId,generation:descriptor.generation,type,payload:{documentId},...override}}))
 t.after(()=>{bridge.dispose();dom.window.close()})
 return {descriptor,bridge,sent,failures,emit,phases}
}
const bootstrap=d=>({execution:'online',online:{onlineSessionId:d.context.session.sessionId,participantId:d.context.session.localParticipantIds[0],server:{endpoint:'wss://gameplay.chibaskogames.fr/',ticket:'a'.repeat(64),expiresAt:new Date(Date.now()+180000).toISOString()}}})
test('v2 does not mint before READY; pending START is single-flight and fenced after dispose',async t=>{
 let calls=0,resolve;const p=await peer(t,d=>{calls++;return new Promise(r=>{resolve=()=>r(bootstrap(d))})})
 p.emit('GAME_HELLO');assert.equal(calls,0);assert.ok(!JSON.stringify(p.sent).includes('ticket'))
 p.emit('GAME_READY');p.emit('GAME_READY');p.bridge.start();assert.equal(calls,1)
 p.bridge.dispose();resolve();await new Promise(r=>setImmediate(r));assert.equal(p.sent.filter(m=>m.type==='GAMEPLAY_START').length,0)
})
test('v2 sends bootstrap only at START, ignores stale messages and reuses context during STOP/resume',async t=>{
 let calls=0;const p=await peer(t,async d=>{calls++;return bootstrap(d)})
 p.emit('GAME_HELLO',{generation:randomUUID()});assert.equal(p.sent.length,0)
 p.emit('GAME_HELLO');p.emit('GAME_READY');await new Promise(r=>setImmediate(r))
 assert.equal(calls,1);const first=p.sent.find(m=>m.type==='GAMEPLAY_START');assert.equal(first.protocolVersion,2);assert.equal(first.payload.context.execution,'online')
 p.bridge.stop();p.bridge.start();assert.equal(calls,1);assert.deepEqual(p.sent.at(-1).payload.context,first.payload.context)
})
test('v2 fails closed when no online authorizer is available',async t=>{
 const p=await peer(t);p.emit('GAME_HELLO');p.emit('GAME_READY');assert.deepEqual(p.failures,['online_session_unavailable'])
})

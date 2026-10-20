import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {dispatchUploads} from '../services/build-validator/queue.ts'
import dispatcher from '../cloudflare/build-dispatcher.ts'
import {uploadRepository} from '../lib/game-distribution/uploads/repository.ts'

function fixture(count=1) {
  const ids=Array.from({length:count},()=>randomUUID()),marked=[],events=[]
  const db={async call(name,args){
    if(name==='distribution_pending')return ids.map(id=>({id}))
    assert.equal(name,'distribution_dispatched');marked.push(args.p_id);events.push('mark:'+args.p_id)
  }}
  return {ids,marked,events,db,async send(id){events.push('send:'+id)}}
}
test('empty outbox performs no publication or acknowledgement',async()=>{
  const h=fixture(0);assert.deepEqual(await dispatchUploads(h.db,h.send),{pending:0,dispatched:0,failed:0,deferred:0})
  assert.deepEqual(h.events,[])
})
test('each acknowledgement follows confirmed publication, including multiple jobs',async()=>{
  for(const count of [1,8]) {
    const h=fixture(count),r=await dispatchUploads(h.db,h.send)
    assert.equal(r.dispatched,count)
    for(const id of h.ids)assert.ok(h.events.indexOf('send:'+id)<h.events.indexOf('mark:'+id))
  }
})
test('publication failure does not mark and does not starve the rest of the batch',async()=>{
  const h=fixture(3),r=await dispatchUploads(h.db,async id=>{if(id===h.ids[0])throw new Error('fixture-private-token');await h.send(id)})
  assert.equal(r.failed,1);assert.equal(r.dispatched,2);assert.ok(!h.marked.includes(h.ids[0]))
  assert.ok(!JSON.stringify(r).includes('fixture-private-token'))
})
test('ambiguous send timeout never acknowledges even when the send later resolves',async()=>{
  const h=fixture();let resolve
  const r=await dispatchUploads(h.db,()=>new Promise(r=>{resolve=r}),{cycleMs:50,operationMs:5})
  assert.equal(r.failed,1);assert.deepEqual(h.marked,[])
  resolve();await new Promise(r=>setTimeout(r,10));assert.deepEqual(h.marked,[])
})
test('DB failure after send permits safe duplicate delivery on retry and concurrent dispatch',async()=>{
  const h=fixture(),original=h.db.call;let fail=true
  h.db.call=async(name,args)=>{if(name==='distribution_dispatched'&&fail)throw new Error('fixture-secret');return original(name,args)}
  assert.equal((await dispatchUploads(h.db,h.send)).failed,1)
  fail=false
  await Promise.all([dispatchUploads(h.db,h.send),dispatchUploads(h.db,h.send)])
  assert.equal(h.events.filter(e=>e.startsWith('send:')).length,3)
  assert.equal(new Set(h.marked).size,1)
})
test('invalid RPC shapes and private HTTP errors never cause sends or leak details',async()=>{
  for(const rows of [null,{},[{id:'not-uuid'}],[{id:[randomUUID()]}],Array.from({length:101},()=>({id:randomUUID()}))]) {
    await assert.rejects(dispatchUploads({call:async()=>rows},async()=>assert.fail('must not send')),/dispatch_pending_invalid/)
  }
  for(const response of [()=>new Response('fixture-private-token',{status:502}),()=>new Response('{malformed'),()=>{throw new Error('fixture-private-token')}]) {
    const db=uploadRepository('https://database.example','fixture-service-role',async()=>response())
    await assert.rejects(dispatchUploads(db,async()=>assert.fail('must not send')),e=>e.message==='dispatch_pending_failed'&&!String(e).includes('fixture-private'))
  }
})
test('batch and concurrency are bounded with durable deferred work',async()=>{
  const h=fixture(100);let active=0,max=0
  const r=await dispatchUploads(h.db,async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--})
  assert.equal(r.dispatched,20);assert.equal(r.deferred,80);assert.ok(max<=5)
})
test('Worker uses the native text producer, has no public mutation and redacts transport failures',async()=>{
  const originalFetch=globalThis.fetch,originalLog=console.log,originalError=console.error,logs=[],id=randomUUID(),calls=[]
  const env={SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-role',BUILD_VALIDATIONS:{async send(body,options){
    assert.deepEqual(JSON.parse(body),{type:'validate_game_build',uploadId:id});assert.deepEqual(options,{contentType:'text'})
    throw new Error('fixture-queue-token malformed Cloudflare response')
  }}}
  try {
    console.log=console.error=value=>logs.push(value)
    globalThis.fetch=async(url)=>{calls.push(String(url));return Response.json([{id}])}
    await assert.rejects(dispatcher.scheduled({},env),/^Error: dispatch_cycle_failed$/)
    assert.equal(calls.length,1);assert.ok(calls[0].endsWith('/rpc/distribution_pending'))
    assert.doesNotMatch(logs.join(' '),/fixture-service-role|fixture-queue-token|malformed|database.example/)
    assert.equal(dispatcher.fetch().status,404)
  }finally{globalThis.fetch=originalFetch;console.log=originalLog;console.error=originalError}
})

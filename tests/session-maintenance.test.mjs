import {test} from 'node:test'
import assert from 'node:assert/strict'
import worker,{maintainSessions} from '../cloudflare/session-maintenance.ts'

test('scheduled maintenance awaits notification delivery and acknowledgement before finishing',async()=>{
 const original=globalThis.fetch;const events=[];let release
 const gate=new Promise(resolve=>{release=resolve})
 globalThis.fetch=async(url,init)=>{
  const path=new URL(url).pathname;events.push(path)
  if(path.endsWith('distribution_claim_submission_email'))return Response.json(events.filter(p=>p===path).length===1?{id:'fixture',lease:'fixture-lease',message:{text:'frozen fixture'}}:null)
  if(path.endsWith('distribution_prepare_submission_email'))return Response.json({text:'frozen fixture'})
  if(path==='/emails'){await gate;return Response.json({id:'fixture-receipt'})}
  if(path.endsWith('distribution_finish_submission_email')){assert.equal(JSON.parse(init.body).p_success,true);return Response.json(null)}
  throw Error('Unexpected fixture request')
 }
 try{
  let finished=false
  const run=worker.scheduled(null,{SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'from@example.test',GAME_SUBMISSION_NOTIFY_EMAIL:'admin@example.test'}).then(()=>{finished=true})
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);assert.ok(events.includes('/emails'))
  release();await run;assert.equal(finished,true);assert.ok(events.some(p=>p.endsWith('distribution_finish_submission_email')))
 }finally{release();globalThis.fetch=original}
})
test('maintenance uses one fenced RPC and no public mutation endpoint',async()=>{
  let calls=0;const events=[]
  await maintainSessions({async call(name,args){assert.equal(name,'distribution_cleanup_sessions');assert.deepEqual(args,{});calls++;return true}},e=>events.push(e))
  assert.equal(calls,1);assert.equal(events[0].outcome,'completed')
  assert.equal(worker.fetch().status,404)
  await worker.scheduled(null,{GAME_SESSION_MAINTENANCE_ENABLED:'0'})
})
test('duplicate maintenance is harmless and failed RPCs never leak their content',async()=>{
  const events=[]
  await maintainSessions({async call(){return false}},e=>events.push(e))
  assert.equal(events[0].outcome,'already_running')
  await assert.rejects(maintainSessions({async call(){throw Error('fixture credential must never appear')}},e=>events.push(e)),/session_maintenance_failed/)
  assert.equal(events[1].outcome,'failed');assert.equal(JSON.stringify(events).includes('credential'),false)
})

import {test} from 'node:test'
import assert from 'node:assert/strict'
import worker,{maintainSessions,runMaintenance} from '../cloudflare/session-maintenance.ts'

test('scheduled maintenance awaits notification delivery and acknowledgement before finishing',async()=>{
 const original=globalThis.fetch;const events=[];let release
 const gate=new Promise(resolve=>{release=resolve})
 globalThis.fetch=async(url,init)=>{
  const path=new URL(url).pathname;events.push(path)
  if(path.endsWith('distribution_claim_submission_email'))return Response.json(events.filter(p=>p===path).length===1?{id:'fixture',lease:'fixture-lease',message:{text:'frozen fixture'}}:null)
  if(path.endsWith('distribution_prepare_submission_email'))return Response.json({text:'frozen fixture'})
  if(path==='/emails'){await gate;return Response.json({id:'fixture-receipt'})}
  if(path.endsWith('distribution_finish_submission_email')){assert.equal(JSON.parse(init.body).p_success,true);return Response.json(null)}
  if(path.endsWith('distribution_maintenance_health'))return Response.json({})
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

test('une tâche en échec ne prive pas les autres tâches de leur exécution',async()=>{
 const calls=[],logs=[]
 const db={async call(name){calls.push(name);if(name==='distribution_cleanup_sessions')throw Error('private-address@example.test credential');return name==='distribution_maintenance_health'?{notifications_attention:2,secret:'private-address@example.test'}:null}}
 await assert.rejects(runMaintenance({GAME_SESSION_MAINTENANCE_ENABLED:'1',GAME_UPLOAD_MAINTENANCE_ENABLED:'1',CONTACT_RECEIPTS_MAINTENANCE_ENABLED:'1',GAME_ACCOUNT_DELETIONS_ENABLED:'1',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1'},
  {db,log:e=>logs.push(e),notifications:async()=>{calls.push('mail');throw Error('private contact')},account:async()=>{calls.push('account');throw Error('private target')}}),/maintenance_cycle_failed/)
 for(const name of ['distribution_cleanup_previews','distribution_cleanup_launches','distribution_maintenance_uploads','contact_cleanup','mail','account','distribution_maintenance_health'])assert.ok(calls.includes(name),name)
 assert.ok(logs.some(e=>e.outcome==='attention_required'&&e.count===2))
 assert.ok(!JSON.stringify(logs).includes('private'));assert.ok(logs.every(e=>e.runId===logs[0].runId))
})

test('les tâches désactivées ne sont ni construites ni exécutées',async()=>{
 await runMaintenance({}, {db:{call(){assert.fail('DB appelée')}},account:()=>assert.fail('Compte appelé'),notifications:()=>assert.fail('Resend appelé')})
 const calls=[]
 await runMaintenance({GAME_SESSION_MAINTENANCE_ENABLED:'1'}, {db:{async call(name){calls.push(name);return name==='distribution_cleanup_sessions'?true:{}}},log(){}})
 assert.ok(!calls.includes('contact_cleanup'));assert.ok(!calls.includes('distribution_maintenance_uploads'))
})

test('un traitement qui ne répond jamais expire sans bloquer les reçus ni la santé du cycle',async()=>{
 const calls=[],logs=[]
 await assert.rejects(runMaintenance({CONTACT_RECEIPTS_MAINTENANCE_ENABLED:'1',GAME_ACCOUNT_DELETIONS_ENABLED:'1',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1'},
  {db:{async call(name){calls.push(name);return {}}},notifications:()=>new Promise(()=>{}),account:()=>new Promise(()=>{}),notificationMs:10,accountMs:10,log:e=>logs.push(e)}),/maintenance_cycle_failed/)
 assert.ok(calls.includes('contact_cleanup'));assert.ok(calls.includes('distribution_maintenance_health'))
 assert.equal(logs.filter(e=>e.outcome==='failed'&&e.task!=='cycle').length,2)
})

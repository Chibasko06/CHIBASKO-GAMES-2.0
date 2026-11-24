import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'

export async function professionalEmailPipeline(query){
 const actor=randomUUID(),admin=randomUUID(),challenge=randomUUID(),secret='disposable-professional-email-pipeline-secret-32',code='000123'
 const ascii=x=>x.replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))
 const literal=x=>x===null?'null':typeof x==='object'?"'"+ascii(JSON.stringify(x)).replaceAll("'","''")+"'::jsonb":"'"+String(x).replaceAll("'","''")+"'"
 await query(`insert into auth.users(id,email,email_confirmed_at) values('${actor}','account-only@example.test',now()),('${admin}','admin@example.test',now());insert into public.admin_users(user_id) values('${admin}');insert into developer_contacts(user_id,first_name,last_name,contact_email,public_name) values('${actor}','Professional','Fixture','professional-pipeline@example.test','Fixture')`)
 const revision=await query(`select email_revision from developer_contacts where user_id='${actor}'`)
 const codeBundle=await build({entryPoints:['lib/game-distribution/developer-email-code.ts'],bundle:true,write:false,platform:'node',format:'esm'})
 const crypto=await import('data:text/javascript;base64,'+Buffer.from(codeBundle.outputFiles[0].text).toString('base64'))
 const binding={actor,revision,challenge},hash=await crypto.developerCodeHash(secret,binding,code),destination=await crypto.developerDestinationHash(secret,'professional-pipeline@example.test'),message=crypto.developerVerificationMessage('professional-pipeline@example.test',code,'noreply@chibaskogames.fr'),encrypted=await crypto.encryptDeveloperEmail(secret,binding,message)
 const reserve=()=>query(`set role service_role;select public.distribution_reserve_developer_email('${actor}','${challenge}','${revision}','${destination}','${hash}',${literal(encrypted)});reset role`)
 await Promise.all([reserve(),reserve()]);assert.equal(await query(`select count(*) from developer_email_challenges where id='${challenge}'`),'1')
 assert.equal(await query(`select message::text like '%${code}%' or message::text like '%professional-pipeline@example.test%' from game_submission_notifications where id='${challenge}'`),'f')
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import worker from './cloudflare/session-maintenance';export default {async fetch(r,env){await worker.scheduled({},env);return new Response('completed')}}`},bundle:true,write:false,platform:'browser',format:'esm'})
 const accepted=new Map(),attempts=[];let lost=2
 const allowed=new Set(['distribution_cleanup_developer_email','distribution_claim_developer_verification','distribution_claim_submission_email','distribution_claim_submission_email_events','distribution_prepare_submission_email','distribution_finish_submission_email','distribution_maintenance_health'])
 async function runtime(flags){return new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',script:bundle.outputFiles[0].text,
  bindings:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'noreply@chibaskogames.fr',GAME_SUBMISSION_NOTIFY_EMAIL:'developers@chibaskogames.fr',DEVELOPER_EMAIL_CODE_SECRET:secret,...flags},
  outboundService:async req=>{const url=new URL(req.url),body=await req.json();if(url.origin==='https://api.resend.com'){
   const key=req.headers.get('Idempotency-Key');attempts.push({key,body});if(accepted.has(key))assert.deepEqual(accepted.get(key),body);else accepted.set(key,body);return Response.json({id:'fixture-'+key})
  }
  assert.equal(url.origin,'https://fixture.invalid');const name=url.pathname.split('/').at(-1);assert.ok(allowed.has(name));
  if(name==='distribution_finish_submission_email'&&body.p_id===challenge&&lost>0){lost--;return Response.json({code:'08006'},{status:503})}
  const args=Object.entries(body).map(([k,v])=>k+'=>'+literal(v)).join(',');let result;try{result=await query(`set role service_role;select to_jsonb(public.${name}(${args}));reset role;`)}catch(error){console.error(JSON.stringify({fixtureRpc:name,sqlError:String(error.stderr??'').split('\n').find(x=>x.startsWith('ERROR:'))?.slice(0,160)}));throw error}return Response.json(result?JSON.parse(result):null)
 }}))}
 let worker=await runtime({DEVELOPER_EMAIL_VERIFICATION_ENABLED:'1',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'0',GAME_DEVELOPER_NOTIFICATIONS_ENABLED:'0'})
 try{
  assert.equal((await worker.dispatchFetch('https://maintenance.fixture')).status,500)
  assert.deepEqual(accepted.get('submission-review/'+challenge),message)
  await query(`update game_submission_notifications set lease_until=clock_timestamp()-interval '1 second',next_attempt_at=clock_timestamp()-interval '1 second' where id='${challenge}'`)
  assert.equal((await worker.dispatchFetch('https://maintenance.fixture')).status,200);assert.equal(accepted.size,1);assert.equal(attempts.length,2)
  const confirms=await Promise.all([1,2].map(()=>query(`set role service_role;select public.distribution_confirm_developer_email('${actor}','${challenge}','${hash}');reset role`)))
  assert.equal(confirms.filter(x=>JSON.parse(x).verified).length,1)
 }finally{await worker.dispose()}
 const game=await query(`select public.distribution_register_game('${actor}',gen_random_uuid(),'Professional pipeline')`),upload=randomUUID(),submission=randomUUID()
 await query(`insert into game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at) values('${upload}','${game}','${actor}',gen_random_uuid(),'1.0.0','queued',100,'{"maxAttempts":3}',now()+interval '1 day');insert into game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id) values('${submission}','Fixture','ignored@example.test','Professional pipeline','https://example.test','web','Fixture','${upload}')`)
 worker=await runtime({DEVELOPER_EMAIL_VERIFICATION_ENABLED:'0',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1',GAME_DEVELOPER_NOTIFICATIONS_ENABLED:'0'})
 try{assert.equal((await worker.dispatchFetch('https://maintenance.fixture')).status,200);assert.equal(accepted.size,2);assert.ok([...accepted.values()].some(m=>m.to[0]==='developers@chibaskogames.fr'));assert.equal(await query(`select sent_at is null from game_submission_notifications where submission_id='${submission}' and event_key='received'`),'t')}finally{await worker.dispose()}
 worker=await runtime({DEVELOPER_EMAIL_VERIFICATION_ENABLED:'0',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1',GAME_DEVELOPER_NOTIFICATIONS_ENABLED:'1'})
 try{
  assert.equal((await worker.dispatchFetch('https://maintenance.fixture')).status,200);assert.equal(accepted.size,3)
  assert.ok([...accepted.values()].some(m=>m.to[0]==='professional-pipeline@example.test'&&m.subject.includes('Soumission reçue')))
  assert.ok(![...accepted.values()].some(m=>m.to[0]==='account-only@example.test'))
  await query(`update developer_contacts set contact_email='changed@example.test' where user_id='${actor}';select public.distribution_request_build_correction('${admin}','${upload}','Correction fixture')`)
  assert.equal((await worker.dispatchFetch('https://maintenance.fixture')).status,200);assert.equal(accepted.size,3)
  assert.equal(await query(`select count(*) from game_submission_notifications where submission_id='${submission}' and delivery_hold='unverified_email'`),'1')
 }finally{await worker.dispose()}
 console.log('Professional pipeline PASS: concurrent reservation, SQL → real Worker → encrypted frozen payload → mocked Resend, lost acknowledgement, one confirmation, internal alerts and verified professional recipient only.')
}

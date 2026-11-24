import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'

export async function developerEmailPipeline(query){
 const actor=randomUUID(),admin=randomUUID(),upload=randomUUID(),submission=randomUUID()
 const ascii=value=>value.replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))
 const literal=value=>value===null?'null':typeof value==='object'?"'"+ascii(JSON.stringify(value)).replaceAll("'","''")+"'::jsonb":"'"+String(value).replaceAll("'","''")+"'"
 await query(`insert into auth.users(id,email,email_confirmed_at) values('${actor}','pipeline-owner@example.test',now()),('${admin}','pipeline-admin@example.test',now());insert into public.admin_users(user_id) values('${admin}');insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name) values('${actor}','Pipeline','Fixture','unverified-contact@example.test','Studio')`)
 await query(`update public.developer_contacts set email_verified_at=now() where user_id='${actor}'`)
 const game=(await query(`select public.distribution_register_game('${actor}',gen_random_uuid(),'Pipeline fixture')`)).trim()
 await query(`insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at) values('${upload}','${game}','${actor}',gen_random_uuid(),'1.0.0','queued',100,'{"revision":"1","maxAttempts":3}',now()+interval '1 day');insert into public.game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id) values('${submission}','Studio','unverified-contact@example.test','Pipeline fixture','https://example.test','web','Description','${upload}')`)
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import worker from './cloudflare/session-maintenance';export default {async fetch(request,env){await worker.scheduled({},env);return new Response('completed')}}`},bundle:true,write:false,platform:'browser',format:'esm'})
 const deliveries=[],requests=[],receipts=new Map(),allowed=new Set(['distribution_claim_submission_email_events','distribution_prepare_submission_email','distribution_finish_submission_email','distribution_maintenance_health'])
 let lostAcknowledgements=2
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',script:bundle.outputFiles[0].text,
  bindings:{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1',GAME_DEVELOPER_NOTIFICATIONS_ENABLED:'1',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'noreply@chibaskogames.fr',GAME_SUBMISSION_NOTIFY_EMAIL:'developers@chibaskogames.fr',NEXT_PUBLIC_SITE_URL:'https://chibaskogames.fr'},
  outboundService:async request=>{
   const url=new URL(request.url),body=await request.json()
   if(url.origin==='https://api.resend.com'){
    const key=request.headers.get('Idempotency-Key');requests.push(key)
    if(receipts.has(key))assert.deepEqual(body,receipts.get(key).body)
    else{const delivery={key,body};deliveries.push(delivery);receipts.set(key,delivery)}
    return Response.json({id:'fixture-'+key})
   }
   assert.equal(url.origin,'https://fixture.invalid')
   const rpc=url.pathname.split('/').at(-1);assert.ok(allowed.has(rpc))
   if(rpc==='distribution_finish_submission_email'&&body.p_id===submission&&lostAcknowledgements>0){lostAcknowledgements--;return Response.json({code:'08006'},{status:503})}
   for(const key of Object.keys(body))assert.match(key,/^p_[a-z_]+$/)
   const sql=Object.entries(body).map(([name,value])=>name+'=>'+literal(value)).join(',')
   const result=await query(`set role service_role;select to_jsonb(public.${rpc}(${sql}));reset role;`)
   return Response.json(result.trim()?JSON.parse(result.trim()):null)
  }}))
 try{
  const run=async(expectedStatus=200)=>assert.equal((await runtime.dispatchFetch('https://maintenance.fixture')).status,expectedStatus)
  await run(500)
  assert.equal(deliveries.length,2)
  assert.equal(new Set(deliveries.map(d=>d.key)).size,2)
  const receipt=deliveries.find(d=>d.body.to[0]==='unverified-contact@example.test')
  assert.ok(receipt);assert.equal(receipt.body.reply_to,'developers@chibaskogames.fr')
  assert.match(receipt.body.html,/\/developer\/games\//)
  assert.ok(deliveries.some(d=>d.key==='submission-review/'+submission&&d.body.to[0]==='developers@chibaskogames.fr'))
  assert.equal((await query(`select count(*) from public.game_submission_notifications where submission_id='${submission}' and sent_at is not null`)).trim(),'1')
  await query(`update public.game_submission_notifications set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where id='${submission}'`)
  await run();assert.equal(deliveries.length,2)
  assert.equal(requests.filter(key=>key==='submission-review/'+submission).length,2)
  assert.equal((await query(`select count(*) from public.game_submission_notifications where submission_id='${submission}' and sent_at is not null`)).trim(),'2')
  await run();assert.equal(deliveries.length,2)
  await query(`select public.distribution_request_build_correction('${admin}','${upload}','Fix <script>fixture</script>')`)
  await run();assert.equal(deliveries.length,3)
  assert.deepEqual(deliveries[2].body.to,['unverified-contact@example.test'])
  assert.match(deliveries[2].body.html,/&lt;script&gt;/);assert.doesNotMatch(deliveries[2].body.html,/<script>/)
  await query(`select public.distribution_request_build_correction('${admin}','${upload}','Fix <script>fixture</script>')`)
  await run();assert.equal(deliveries.length,3)
  assert.equal((await query(`select count(*) from public.game_submission_notifications where submission_id='${submission}' and sent_at is null`)).trim(),'0')
 }finally{await runtime.dispose()}
 console.log('Developer e-mail pipeline PASS: SQL events → leased outbox → real Worker → mocked Resend → SQL acknowledgement; verified recipient, correction and no duplicate.')
}

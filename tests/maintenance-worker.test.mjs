import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

test('le Worker et le portail préparent le même payload pour les trois types de soumission',async()=>{
 const source=await build({entryPoints:['lib/emailMessages.ts'],bundle:true,write:false,platform:'node',format:'esm'})
 const {submissionEmailMessage}=await import('data:text/javascript;base64,'+Buffer.from(source.outputFiles[0].text).toString('base64'))
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import worker from './cloudflare/session-maintenance';export default {async fetch(request,env){await worker.scheduled({},env);return new Response('completed')}}`},bundle:true,write:false,platform:'browser',format:'esm'})
 for(const mode of ['classic','sdk','external']){
  const job={id:'fa800000-0000-4000-8000-000000000010',lease:'fa800000-0000-4000-8000-000000000011',message:null,
   contact:{firstName:'Élodie',lastName:'Fixture',contactEmail:'fixture@example.test'},title:'Jeu de test',version:mode==='external'?null:'1.0.0',kind:'new',
   uploadId:mode==='external'?null:'fa800000-0000-4000-8000-000000000012',externalRevisionId:mode==='external'?'fa800000-0000-4000-8000-000000000013':null,studio:'Studio de test'}
  const bindings={SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'noreply@chibaskogames.fr',GAME_SUBMISSION_NOTIFY_EMAIL:'developers@chibaskogames.fr',NEXT_PUBLIC_SITE_URL:'https://chibaskogames.fr'}
  const expected=submissionEmailMessage(job,bindings.RESEND_FROM_EMAIL,bindings.GAME_SUBMISSION_NOTIFY_EMAIL,bindings.NEXT_PUBLIC_SITE_URL)
  let claimed=false,prepared,sent=0,acknowledged=false
  const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',script:bundle.outputFiles[0].text,bindings,outboundService:async request=>{
   const url=new URL(request.url),body=await request.json()
   if(url.hostname==='api.resend.com'){
    assert.equal(request.headers.get('Idempotency-Key'),'submission-review/'+job.id)
    assert.deepEqual(body,expected);assert.deepEqual(body,prepared)
    assert.match(body.html,/chibaskogames-email-logo-v2\.png/);assert.match(body.html,/light only/)
    assert.ok(body.text);sent++;return Response.json({id:'fixture-receipt'})
   }
   assert.equal(url.hostname,'db.example.test')
   if(url.pathname.endsWith('distribution_claim_submission_email')){if(claimed)return Response.json(null);claimed=true;return Response.json(job)}
   if(url.pathname.endsWith('distribution_prepare_submission_email')){prepared=body.p_message;return Response.json(prepared)}
   if(url.pathname.endsWith('distribution_finish_submission_email')){assert.equal(body.p_success,true);acknowledged=true;return Response.json(null)}
   if(url.pathname.endsWith('distribution_maintenance_health'))return Response.json({})
   assert.fail('RPC imprévue')
  }}))
  try{assert.equal((await runtime.dispatchFetch('https://maintenance.test')).status,200);assert.equal(sent,1);assert.equal(acknowledged,true)}finally{await runtime.dispose()}
 }
})

test('le Worker conserve un ancien payload et la même clé après un acquittement perdu',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import worker from './cloudflare/session-maintenance';export default {async fetch(request,env){await worker.scheduled({},env);return new Response('completed')}}`},bundle:true,write:false,platform:'browser',format:'esm'})
 const frozen={from:'ancien@example.test',to:['archive@example.test'],reply_to:'fixture@example.test',subject:'Ancien objet',text:'Message déjà préparé'}
 const job={id:'fa800000-0000-4000-8000-000000000020',lease:'fa800000-0000-4000-8000-000000000021',message:frozen}
 let claimed=false,cycle=0,accepted=false;const sent=[],keys=[],receipts=new Set()
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',script:bundle.outputFiles[0].text,bindings:{SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'noreply@chibaskogames.fr',GAME_SUBMISSION_NOTIFY_EMAIL:'developers@chibaskogames.fr'},outboundService:async request=>{
  const url=new URL(request.url),body=await request.json()
  if(url.hostname==='api.resend.com'){assert.deepEqual(body,frozen);sent.push(body);keys.push(request.headers.get('Idempotency-Key'));receipts.add(keys.at(-1));return Response.json({id:'same-receipt'})}
  assert.equal(url.hostname,'db.example.test')
  if(url.pathname.endsWith('distribution_claim_submission_email')){if(claimed||accepted)return Response.json(null);claimed=true;return Response.json(job)}
  if(url.pathname.endsWith('distribution_prepare_submission_email')){assert.deepEqual(body.p_message,frozen);return Response.json(frozen)}
  if(url.pathname.endsWith('distribution_finish_submission_email')){if(cycle===0)return Response.json({code:'08006'},{status:503});assert.equal(body.p_success,true);accepted=true;return Response.json(null)}
  if(url.pathname.endsWith('distribution_maintenance_health'))return Response.json({})
  assert.fail('RPC imprévue')
 }}))
 try{
  await runtime.dispatchFetch('https://maintenance.test');cycle++;claimed=false
  await runtime.dispatchFetch('https://maintenance.test');claimed=false
  await runtime.dispatchFetch('https://maintenance.test')
  assert.equal(sent.length,2);assert.equal(receipts.size,1);assert.equal(accepted,true)
  assert.deepEqual(keys,['submission-review/'+job.id,'submission-review/'+job.id])
 }finally{await runtime.dispose()}
})

test('le Worker reprend une alerte de modération sans nouveau cron et attend son acquittement',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import worker from './cloudflare/session-maintenance';export default {async fetch(request,env){await worker.scheduled({},env);return new Response('completed')}}`},bundle:true,write:false,platform:'browser',format:'esm'})
 const calls=[];let claimed=false,message
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',script:bundle.outputFiles[0].text,bindings:{SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',MODERATION_MAINTENANCE_ENABLED:'1',RESEND_API_KEY:'fixture-only',RESEND_FROM_EMAIL:'noreply@example.test',CONTACT_NOTIFY_EMAIL:'admin@example.test',MODERATION_APPEAL_EMAIL:'appeal@example.test'},outboundService:async request=>{
  const url=new URL(request.url),body=await request.json();calls.push(url.pathname)
  if(url.hostname==='api.resend.com'){assert.equal(request.headers.get('Idempotency-Key'),'moderation/fa800000-0000-4000-8000-000000000001');assert.deepEqual(body,message);return Response.json({id:'fixture-only'})}
  assert.equal(url.hostname,'db.example.test')
  if(url.pathname.endsWith('distribution_moderation_cleanup'))return Response.json(0)
  if(url.pathname.endsWith('distribution_moderation_claim_mail')){if(claimed)return Response.json(null);claimed=true;return Response.json({id:'fa800000-0000-4000-8000-000000000001',lease:'fa800000-0000-4000-8000-000000000002',kind:'admin',message:null,case:{id:'fa800000-0000-4000-8000-000000000003',number:42,target_kind:'game',category:'spam',contact_email:null}})}
  if(url.pathname.endsWith('distribution_moderation_prepare_mail')){message=body.p_message;return Response.json(message)}
  if(url.pathname.endsWith('distribution_moderation_finish_mail')){assert.equal(body.p_success,true);return Response.json(null)}
  if(url.pathname.endsWith('distribution_maintenance_health'))return Response.json({})
  assert.fail('RPC imprévue')
 }}))
 try{assert.equal((await runtime.dispatchFetch('https://maintenance.test')).status,200);assert.ok(calls.includes('/rest/v1/rpc/distribution_moderation_finish_mail'));assert.equal(calls.filter(path=>path==='/emails').length,1)}finally{await runtime.dispose()}
})

test('les configurations de production conservent les ressources et les activations explicites',async()=>{
 const config=async path=>{const parsed=ts.parseConfigFileTextToJson(path,await readFile(path,'utf8'));assert.equal(parsed.error,undefined);return parsed.config}
 const maintenance=await config('cloudflare/wrangler.maintenance.production.jsonc')
 assert.deepEqual(maintenance.triggers.crons,['*/5 * * * *'])
 assert.equal(maintenance.workers_dev,false)
 assert.equal(maintenance.preview_urls,false)
 assert.equal(maintenance.build.command,'npm run build:maintenance')
 for(const flag of ['GAME_SESSION_MAINTENANCE_ENABLED','GAME_UPLOAD_MAINTENANCE_ENABLED','GAME_SUBMISSION_NOTIFICATIONS_ENABLED','CONTACT_RECEIPTS_MAINTENANCE_ENABLED'])assert.equal(maintenance.vars[flag],'1')
 const portal=await config('wrangler.jsonc')
 for(const cfg of [portal,maintenance]){
  assert.equal(cfg.keep_vars,true)
  assert.equal(cfg.vars.GAME_ACCOUNT_DELETIONS_ENABLED,'1')
  for(const secret of ['SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','PASSWORD_RESET_CODE_SECRET','CONTACT_HASH_SECRET','GAME_BUILDS_R2_ACCESS_KEY_ID','GAME_BUILDS_R2_SECRET_ACCESS_KEY'])assert.equal(Object.hasOwn(cfg.vars,secret),false)
 }
 for(const flag of ['CONTACT_FORM_ENABLED','GAME_DISTRIBUTION_UPLOADS_ENABLED','GAME_ARTIFACT_PREVIEWS_ENABLED','GAME_SUBMISSION_NOTIFICATIONS_ENABLED','GAME_RUNTIME_LAUNCHES_ENABLED'])assert.equal(portal.vars[flag],'1')
 assert.equal(portal.vars.CONTACT_NOTIFY_EMAIL,'contact@chibaskogames.fr')
 assert.equal(maintenance.vars.SUPABASE_URL,portal.vars.NEXT_PUBLIC_SUPABASE_URL)
 assert.equal(portal.vars.GAME_SUBMISSION_NOTIFY_EMAIL,'developers@chibaskogames.fr')
 assert.equal(portal.vars.RESEND_FROM_EMAIL,'noreply@chibaskogames.fr')
 assert.equal(portal.vars.MODERATION_APPEAL_EMAIL,portal.vars.CONTACT_NOTIFY_EMAIL)
 for(const name of ['RESEND_FROM_EMAIL','CONTACT_NOTIFY_EMAIL','GAME_SUBMISSION_NOTIFY_EMAIL','MODERATION_APPEAL_EMAIL','NEXT_PUBLIC_SITE_URL'])assert.equal(maintenance.vars[name],portal.vars[name])
 for(const cfg of [portal,maintenance])assert.deepEqual(cfg.r2_buckets.map(({binding,bucket_name})=>[binding,bucket_name]).sort(),[
  ['CHIBASKO_ASSETS','chibasko-assets'],['GAME_BUILDS_ARTIFACTS','chibasko-game-artifacts'],['GAME_BUILDS_STAGING','chibasko-game-staging']])
 const dispatcher=await config('cloudflare/wrangler.dispatcher.production.jsonc')
 assert.deepEqual(dispatcher.triggers.crons,['*/5 * * * *'])
 assert.equal(dispatcher.vars.GAME_BUILD_DISPATCHER_ENABLED,'0')
 assert.deepEqual(dispatcher.queues.producers,[{binding:'BUILD_VALIDATIONS',queue:'chibasko-game-builds'}])
 const gateway=await config('cloudflare/wrangler.artifacts.production.jsonc')
 assert.deepEqual(gateway.triggers.crons,['*/15 * * * *'])
 assert.deepEqual(gateway.r2_buckets,[{binding:'ARTIFACTS',bucket_name:'chibasko-game-artifacts'}])
 for(const cfg of [dispatcher,gateway]){
  assert.equal(cfg.keep_vars,true)
  assert.equal(cfg.vars.SUPABASE_URL,portal.vars.NEXT_PUBLIC_SUPABASE_URL)
  assert.equal(Object.hasOwn(cfg.vars,'SUPABASE_SERVICE_ROLE_KEY'),false)
  assert.equal(Object.hasOwn(cfg.vars,'RESEND_API_KEY'),false)
 }
})
test('le handler planifié attend ses RPC dans un isolate Workers local',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import worker from './cloudflare/session-maintenance';export default {scheduled:worker.scheduled,async fetch(request,env){await worker.scheduled({cron:'*/5 * * * *'},env);return new Response('completed')}}`},bundle:true,write:false,platform:'browser',format:'esm'})
 const calls=[]
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',script:bundle.outputFiles[0].text,bindings:{SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',CONTACT_RECEIPTS_MAINTENANCE_ENABLED:'1'},outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://db.example.test');calls.push(url.pathname)
  return Response.json(url.pathname.endsWith('contact_cleanup')?null:{expired_contacts:0})
 }}))
 try{const result=await runtime.dispatchFetch('http://localhost/');assert.equal(await result.text(),'completed');assert.deepEqual(calls,['/rest/v1/rpc/contact_cleanup','/rest/v1/rpc/distribution_maintenance_health'])}finally{await runtime.dispose()}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'

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
 assert.equal(portal.vars.CONTACT_NOTIFY_EMAIL,'chibasko06@gmail.com')
 assert.equal(maintenance.vars.SUPABASE_URL,portal.vars.NEXT_PUBLIC_SUPABASE_URL)
 for(const name of ['RESEND_FROM_EMAIL','GAME_SUBMISSION_NOTIFY_EMAIL','NEXT_PUBLIC_SITE_URL'])assert.equal(maintenance.vars[name],portal.vars[name])
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

import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
test('le handler planifié attend ses RPC dans un isolate Workers local',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`import worker from './cloudflare/session-maintenance';export default {scheduled:worker.scheduled,async fetch(request,env){await worker.scheduled({cron:'*/5 * * * *'},env);return new Response('completed')}}`},bundle:true,write:false,platform:'browser',format:'esm'})
 const calls=[]
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',script:bundle.outputFiles[0].text,bindings:{SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',CONTACT_RECEIPTS_MAINTENANCE_ENABLED:'1'},outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://db.example.test');calls.push(url.pathname)
  return Response.json(url.pathname.endsWith('contact_cleanup')?null:{expired_contacts:0})
 }}))
 try{const result=await runtime.dispatchFetch('http://localhost/');assert.equal(await result.text(),'completed');assert.deepEqual(calls,['/rest/v1/rpc/contact_cleanup','/rest/v1/rpc/distribution_maintenance_health'])}finally{await runtime.dispose()}
})

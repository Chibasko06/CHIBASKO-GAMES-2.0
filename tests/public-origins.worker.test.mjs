import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {sha256} from '../lib/game-distribution/build.ts'

test('Gateway workerd : bootstrap, cookie, R2 natif, répertoire et révocation',{timeout:60000},async()=>{
 const config={publicBase:'chibaskogames-play.fr',previewBase:'chibaskogames-play.fr',contentBase:'chibaskogames-play.fr',portalOrigins:['https://portal.test'],stableOrigins:true}
 const h=await runtimeHarness('solo','published','normal',config,'classic'),launch=await h.client.create(h.request),d=launch.descriptor
 const bundle=await build({entryPoints:['cloudflare/artifact-gateway.ts'],bundle:true,write:false,format:'esm',platform:'browser'})
 const worker=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-16',r2Buckets:['ARTIFACTS'],bindings:{
  GAME_ARTIFACT_GATEWAY_ENABLED:'1',GAME_CONTENT_PUBLIC_BASE:config.publicBase,GAME_CONTENT_PREVIEW_BASE:config.previewBase,GAME_CONTENT_BASE_DOMAIN:config.contentBase,GAME_PORTAL_ORIGINS:'https://portal.test',SUPABASE_URL:'https://database.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'
 },outboundService:async request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://database.example.test')
  const name=url.pathname.split('/').at(-1)
  try{return Response.json(await h.db.call(name,await request.json()))}catch(error){return Response.json({message:error.code??'database_error'},{status:400})}
 }}))
 try{
  const bucket=await worker.getR2Bucket('ARTIFACTS')
  for(const [path,bytes]of h.files)await bucket.put(h.row.storage_prefix+path,bytes,{customMetadata:{sha256:await sha256(bytes)}})
  assert.equal((await worker.dispatchFetch(d.contentOrigin+'/_launch/bootstrap')).status,200)
  assert.equal((await worker.dispatchFetch(d.entrypointUrl)).status,403)
  const exchanged=await worker.dispatchFetch(d.contentOrigin+'/_launch/exchange',{method:'POST',headers:{Origin:d.contentOrigin,'Content-Type':'application/json'},body:JSON.stringify({ticket:d.delivery.ticket})})
  assert.equal(exchanged.status,200,await exchanged.clone().text())
  const cookie=exchanged.headers.get('set-cookie').split(';')[0]
  const entry=d.contentOrigin+(await exchanged.json()).entrypoint
  const root=await worker.dispatchFetch(d.contentOrigin+'/',{headers:{Cookie:cookie,Referer:entry},redirect:'manual'})
  assert.equal(root.status,307);assert.equal(root.headers.get('location'),entry)
  const html=await worker.dispatchFetch(entry,{headers:{Cookie:cookie}})
  assert.equal(html.status,200);assert.match(await html.text(),/Jeu classique sans SDK/)
  assert.equal(html.headers.get('cdn-cache-control'),'no-store');assert.equal(html.headers.get('set-cookie'),null)
  await h.client.release(launch)
  assert.equal((await worker.dispatchFetch(entry,{headers:{Cookie:cookie}})).status,403)
 }finally{await worker.dispose()}
})

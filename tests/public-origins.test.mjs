import test from 'node:test'
import assert from 'node:assert/strict'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {publicCookieValue,publicGameHost,publicBuildPath,publicVersionRequest} from '../lib/game-distribution/gateway/public-origin.ts'
import {artifactRequestPath} from '../lib/game-distribution/gateway/http.ts'
import {launchConfiguration} from '../lib/server/gameLaunchConfiguration.ts'
import {validateLaunchHandle} from '../lib/game-runtime/controller.ts'

const config={publicBase:'chibaskogames-play.fr',previewBase:'chibaskogames-play.fr',contentBase:'chibaskogames-play.fr',portalOrigins:['https://portal.test'],stableOrigins:true}
test('Le flag serveur est désactivé par défaut et refuse les valeurs ambiguës',()=>{
 const env={GAME_RUNTIME_LAUNCHES_ENABLED:'1',GAME_CONTENT_BASE_DOMAIN:config.contentBase,GAME_PORTAL_ORIGINS:'https://portal.test',NEXT_PUBLIC_SUPABASE_URL:'https://database.example.test',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'}
 assert.equal(launchConfiguration(env).stableOrigins,false)
 assert.equal(launchConfiguration({...env,GAME_STABLE_ORIGINS_ENABLED:'1'}).stableOrigins,true)
 for(const value of ['true',' 1','yes',''])assert.throws(()=>launchConfiguration({...env,GAME_STABLE_ORIGINS_ENABLED:value}))
})

test('L’hôte de diagnostic ne dessert aucun jeu et n’appelle ni SQL ni R2',async()=>{
 const forbidden=async()=>assert.fail('Aucun accès de stockage ne doit être effectué')
 const {createArtifactGateway}=await import('../lib/game-distribution/gateway/gateway.ts')
 const gateway=createArtifactGateway({...config,stableOrigins:false},{db:{call:forbidden},storage:{head:forbidden,get:forbidden}}),origin='https://diagnostics.'+config.contentBase
 const root=await gateway(new Request(origin+'/'));assert.equal(root.status,200);assert.match(root.headers.get('set-cookie'),/__Host-cg-public=/);assert.match(root.headers.get('content-security-policy'),/nonce-/)
 assert.equal((await gateway(new Request(origin+'/asset.data'))).status,404)
 assert.equal((await gateway(new Request(origin+'/',{headers:{'service-worker':'script'}}))).status,403)
 assert.equal((await gateway(new Request(origin+'/check',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:'{}'}))).status,403)
 assert.equal((await gateway(new Request(origin+'/check',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({hash:'a'.repeat(64),phase:['read']})}))).status,400)
})
test('Accès stable : ticket dans le fragment seulement, échange unique et accès contrôlé à chaque fichier',async()=>{
 const h=await runtimeHarness('solo','published','normal',config,'classic',files=>files.set('docs/index.html',new TextEncoder().encode('<!doctype html><title>Documentation</title>'))),a=await h.client.create(h.request),d=a.descriptor
 assert.equal(d.contentOrigin,'https://'+publicGameHost(d.gameId,config.contentBase))
 assert.ok(!d.entrypointUrl.includes(d.delivery.ticket))
 assert.ok([403,404].includes((await h.gateway(new Request('https://l-'+d.delivery.ticket+'.'+config.contentBase+'/index.html'))).status))
 const exchange=body=>h.gateway(new Request(d.contentOrigin+'/_launch/exchange',{method:'POST',headers:{Origin:d.contentOrigin,'Content-Type':'application/json'},body:JSON.stringify(body)}))
 assert.ok([403,404].includes((await h.gateway(new Request(d.entrypointUrl))).status))
 const boot=await h.gateway(new Request(d.contentOrigin+'/_launch/bootstrap'));assert.equal(boot.status,200);assert.match(boot.headers.get('content-security-policy'),/nonce-/)
 const response=await exchange({ticket:d.delivery.ticket});assert.equal(response.status,200)
 const cookie=response.headers.get('set-cookie');assert.match(cookie,/^__Host-cg-public=[a-f0-9]{64}; Path=\/; Secure; HttpOnly; SameSite=None; Partitioned;/);assert.doesNotMatch(cookie,/Domain=/)
 const entry=(await response.json()).entrypoint
 const get=path=>h.gateway(new Request(d.contentOrigin+path,{headers:{Cookie:cookie.split(';')[0],Referer:d.contentOrigin+entry}}))
 assert.equal((await get(entry)).status,200)
 assert.equal((await get('/')).status,307)
 assert.equal((await get('/')).headers.get('location'),d.contentOrigin+entry)
 assert.equal((await get('/docs/')).headers.get('location'),d.contentOrigin+publicBuildPath(d.gameVersionId,'docs/index.html'))
 assert.equal((await get('/missing-directory/')).status,404)
 assert.equal((await exchange({ticket:d.delivery.ticket})).status,409)
 assert.equal((await exchange({ticket:d.delivery.ticket,extra:true})).status,400)
 await h.client.release(a);assert.ok([403,404].includes((await get(entry)).status))
 assert.ok(h.logs.every(row=>!JSON.stringify(row).includes(d.delivery.ticket)))
})

test('La version d’URL ou de référent reste une indication de routage, jamais une autorisation',()=>{
 const version='11111111-1111-4111-8111-111111111111',origin='https://game.example.test',path=publicBuildPath(version,'assets/main.js')
 assert.equal(publicVersionRequest(new Request(origin+path)).versionId,version)
 assert.equal(publicVersionRequest(new Request(origin+'/asset.data',{headers:{Referer:origin+path}})).versionId,version)
 assert.throws(()=>publicVersionRequest(new Request(origin+'/asset.data')))
 assert.throws(()=>publicVersionRequest(new Request(origin+'/asset.data',{headers:{Referer:'https://other.example.test'+path}})))
 assert.throws(()=>publicVersionRequest(new Request(origin+'/__chibasko_build__/invalide/asset.data')))
 const long='a'.repeat(500)+'.txt';assert.equal(artifactRequestPath(origin+publicBuildPath(version,long),true,'__chibasko_build__/'+version),long)
})
test('Prévisualisation privée et mode désactivé conservent leurs origines éphémères',async()=>{
 for(const [audience,stableOrigins] of [['preview',true],['published',false]]){
  const h=await runtimeHarness('solo',audience,'normal',{...config,stableOrigins},'classic'),a=await h.client.create(h.request),b=await h.client.create(h.request)
  assert.equal(a.descriptor.delivery,undefined);assert.notEqual(a.descriptor.contentOrigin,b.descriptor.contentOrigin)
 }
})
test('Le lecteur refuse les descripteurs de livraison incomplets ou mal typés',async()=>{
 const h=await runtimeHarness('solo','published','normal',{...config,stableOrigins:false},'classic'),launch=await h.client.create(h.request)
 for(const delivery of [null,false,0,{},[],{mode:'stable-public',ticket:['a'.repeat(48)]}])assert.throws(()=>validateLaunchHandle({...launch,descriptor:{...launch.descriptor,delivery}},h.request,'https://portal.test'))
})
test('Cookies ambigus et chemins de traversée refusés ; répertoires résolus sans sortir du préfixe',()=>{
 assert.throws(()=>publicCookieValue(new Request('https://example.test',{headers:{Cookie:'__Host-cg-public='+ 'a'.repeat(64)+'; __Host-cg-public='+ 'b'.repeat(64)}})))
 assert.equal(artifactRequestPath('https://example.test/',true),'')
 assert.equal(artifactRequestPath('https://example.test/docs/',true),'docs/')
 for(const path of ['/%2e%2e/','/../','/a//','/a/%2f/','/a/%255c/'])assert.throws(()=>artifactRequestPath('https://example.test'+path,true))
})

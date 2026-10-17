import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { validateWebBuild, sha256 } from '../lib/game-distribution/build.ts'
import { gameArtifactKeys } from '../lib/game-distribution/keys.ts'
import { resolveGameVersion, contentOrigin, launchDescriptor, validateGatewayConfiguration, validateDeliveryPolicy } from '../lib/game-distribution/gateway/resolver.ts'
import { previewService } from '../lib/game-distribution/gateway/preview.ts'
import { createArtifactGateway } from '../lib/game-distribution/gateway/gateway.ts'
import { artifactRequestPath } from '../lib/game-distribution/gateway/http.ts'
import { PREVIEW_COOKIE, GatewayError } from '../lib/game-distribution/gateway/contracts.ts'
import { UploadError } from '../lib/game-distribution/uploads/policy.ts'
import { artifactReader } from '../cloudflare/artifact-reader.ts'
import { developerPreviewRequest } from '../lib/server/developerPreviews.ts'

const encoder=new TextEncoder(),config={publicBase:'games-content.example',previewBase:'games-content.example',portalOrigins:['https://chibaskogames.fr']}
const owner='owner',collaborator='collaborator',admin='admin',reviewer='reviewer'
async function harness(name='solo',status='draft',onlineOnly=false) {
  const root=new URL('./fixtures/game-builds/'+name+'/',import.meta.url),manifest=JSON.parse(await readFile(new URL('chibasko.json',root),'utf8'))
  if(onlineOnly){delete manifest.capabilities.local;delete manifest.client.entrypoints.local;manifest.capabilities.online.players={min:2,max:4}}
  const entry=Object.values(manifest.client.entrypoints)[0]
  const files=[{path:'chibasko.json',bytes:encoder.encode(JSON.stringify(manifest))},
    {path:entry,bytes:new Uint8Array(await readFile(new URL(entry,root)))},
    {path:'game.js',bytes:encoder.encode('window.gameLoaded=true')},{path:'styles.css',bytes:encoder.encode('canvas{display:block}')},
    {path:'engine.wasm',bytes:new Uint8Array([0,97,115,109,1,0,0,0])},{path:'assets/world.data',bytes:new Uint8Array([0,1,2,3,4,5,6,7])},
    {path:'assets/game.ogg',bytes:new Uint8Array([1,2,3])},{path:'fonts/game.woff2',bytes:new Uint8Array([1,2,3])},
    {path:'engine.js.gz',bytes:new Uint8Array([31,139,8,0])},
    {path:'assets/logo.png',bytes:new Uint8Array([137,80,78,71])},{path:'settings.json',bytes:encoder.encode('{}')}]
  const artifact=await validateWebBuild(files,{gameId:manifest.gameId,version:manifest.version}),id=randomUUID(),prefix=gameArtifactKeys(manifest.gameId,id,artifact.artifactSha256).clientPrefix
  const row={id,game_id:manifest.gameId,version:manifest.version,schema_version:1,integration_version:1,status,manifest,
    artifact_sha256:artifact.artifactSha256,storage_prefix:prefix,delivery_policy:{profile:'web-v1',connectOrigins:[],assetOrigins:[]}}
  const sessions=new Map(),members=new Set([owner,collaborator]),logs=[],reads=[],objects=new Map();let pulls=0
  for(const file of files)objects.set(prefix+file.path,{bytes:file.bytes,sha256:await sha256(file.bytes),etag:'storage-'+file.path})
  const permitted=actor=>members.has(actor)||actor===admin||(actor===reviewer && ['in_review','approved'].includes(row.status))
  const db={async call(name,args){
    if(name==='distribution_resolve_version')return args.p_version===row.id?structuredClone(row):null
    if(name==='distribution_issue_preview'){
      if(args.p_version!==row.id)throw new UploadError('version_not_found',404)
      if(!permitted(args.p_actor))throw new UploadError('preview_forbidden',403)
      if(!['draft','in_review','approved'].includes(row.status))throw new UploadError('version_not_previewable',409)
      if(!row.manifest.client.entrypoints[args.p_execution])throw new UploadError('unsupported_execution',400)
      const s={id:randomUUID(),version_id:row.id,execution:args.p_execution,expires_at:new Date(Date.now()+900000).toISOString(),
        ticket_expires_at:Date.now()+60000,ticket_hash:args.p_ticket_hash,actor:args.p_actor,cookie_hash:null}
      sessions.set(s.id,s);return s
    }
    const s=sessions.get(args.p_session)
    if(!s || Date.parse(s.expires_at)<=Date.now())throw new UploadError('preview_expired',403)
    if(name==='distribution_exchange_preview'){
      if(s.ticket_hash!==args.p_ticket_hash || s.ticket_expires_at<=Date.now())throw new UploadError('preview_expired',403)
      if(s.cookie_hash)throw new UploadError('preview_replayed',409)
    }else if(name==='distribution_check_preview'){
      if(s.cookie_hash!==args.p_cookie_hash)throw new UploadError('preview_expired',403)
    }else throw new Error(name)
    if(!permitted(s.actor))throw new UploadError('preview_forbidden',403)
    if(!['draft','in_review','approved'].includes(row.status))throw new UploadError('version_not_previewable',409)
    if(name==='distribution_exchange_preview')s.cookie_hash=args.p_cookie_hash
    return s
  }}
  const binding={async head(key){reads.push(['HEAD',key]);const file=objects.get(key);return file?{size:file.bytes.length,etag:file.etag,customMetadata:{sha256:file.sha256},httpMetadata:{contentType:'text/html'}}:null},
    async get(key,options){reads.push(['GET',key,options]);const file=objects.get(key);if(!file)return null
      assert.equal(options.onlyIf.etagMatches,file.etag)
      const selected=options.range?file.bytes.slice(options.range.offset,options.range.offset+options.range.length):file.bytes
      let offset=0
      const body=new ReadableStream({pull(controller){pulls++;if(offset>=selected.length){controller.close();return}controller.enqueue(selected.slice(offset,offset+2));offset+=2}},{highWaterMark:0})
      return {body,size:file.bytes.length,etag:file.etag,...(options.range?{range:options.range}:{})}
    }}
  const service=previewService(db,config),gateway=createArtifactGateway(config,{db,storage:artifactReader(binding),log:e=>logs.push(e)})
  return {row,db,sessions,members,files,objects,reads,logs,service,gateway,get pulls(){return pulls}}
}
const request=(origin,path,init={})=>new Request(origin+'/'+path,init)
async function exchange(h,actor=owner,execution=h.row.manifest.capabilities.local?'local':'online') {
  const issued=await h.service.issue(actor,h.row.id,execution)
  const response=await h.gateway(new Request(issued.preview.action,{method:'POST',headers:{Origin:config.portalOrigins[0],'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(issued.preview.fields)}))
  assert.equal(response.status,303)
  const cookie=response.headers.get('set-cookie').split(';')[0]
  return {issued,cookie,response,origin:issued.launch.contentOrigin,sessionId:[...h.sessions.keys()].at(-1)}
}
test('resolver validates manifest/game/version/prefix linkage, exposes only clean launch descriptors and never selects current',async()=>{
  const h=await harness()
  for(const status of ['draft','published','archived']){h.row.status=status;assert.equal((await resolveGameVersion(h.row.id,h.db)).status,status)}
  await assert.rejects(resolveGameVersion(randomUUID(),h.db),/version_not_found/)
  const resolved=await resolveGameVersion(h.row.id,h.db),launch=launchDescriptor(resolved,'local',contentOrigin(config,'public',h.row.id))
  assert.ok(launch.entrypointUrl.endsWith('/play/start.html'));assert.equal(new URL(launch.entrypointUrl).origin,launch.contentOrigin)
  assert.doesNotMatch(JSON.stringify(launch),/storage|prefix|artifact_sha|bucket|cookie|ticket|supabase|service_role/i)
  for(const change of [r=>r.storage_prefix='staging/',r=>r.game_id=randomUUID(),r=>r.id=randomUUID(),r=>r.version='2.0.0',r=>r.integration_version=2]) {
    const row=structuredClone(h.row);change(row);await assert.rejects(resolveGameVersion(h.row.id,{async call(){return row}}),/invalid_version_record/)
  }
})
test('origin configuration enforces a separate registrable site, with one immutable public/session host per identity',()=>{
  assert.ok(validateGatewayConfiguration(config))
  for(const base of ['games.chibaskogames.fr','preview.chibaskogames.fr','chibaskogames.fr'])assert.throws(()=>validateGatewayConfiguration({...config,publicBase:base}),/configuration/)
  assert.throws(()=>validateGatewayConfiguration({...config,publicBase:'games.example.co.uk',portalOrigins:['https://portal.example.co.uk']}),/configuration/)
  assert.notEqual(contentOrigin(config,'public',randomUUID()),contentOrigin(config,'public',randomUUID()))
  assert.notEqual(contentOrigin(config,'preview',randomUUID()),contentOrigin(config,'public',randomUUID()))
})
test('preview API authenticates, rejects IDOR/foreign origin and returns a POST ticket, never a token URL',async()=>{
  const h=await harness(),deps={async authenticate(req){const user=req.headers.get('authorization');if(!user)throw new GatewayError('unauthorized',401);return user},service:()=>h.service}
  const make=actor=>new Request('https://chibaskogames.fr/api/developer/game-versions/'+h.row.id+'/preview',{method:'POST',headers:{'Content-Type':'application/json',...(actor?{Authorization:actor}:{})},body:JSON.stringify({execution:'local'})})
  assert.equal((await developerPreviewRequest(make(),h.row.id,deps)).status,401)
  assert.equal((await developerPreviewRequest(make('outsider'),h.row.id,deps)).status,403)
  const foreign=make(owner);foreign.headers.set('Origin','https://other.example.com')
  assert.equal((await developerPreviewRequest(foreign,h.row.id,deps)).status,403)
  assert.equal((await developerPreviewRequest(make(owner),randomUUID(),deps)).status,404)
  const response=await developerPreviewRequest(make(owner),h.row.id,deps),{data}=await response.json()
  assert.equal(response.status,201);assert.equal(data.preview.method,'POST');assert.equal(new URL(data.preview.action).search,'')
  assert.equal(data.preview.fields.ticket.length,43);assert.match(response.headers.get('cache-control'),/no-store/)
  assert.notEqual([...h.sessions.values()][0].ticket_hash,data.preview.fields.ticket)
})
test('owner/collaborator/admin/reviewer, expiry, one-time replay and wrong session bindings are checked',async()=>{
  const h=await harness()
  for(const actor of [owner,collaborator,admin])assert.equal((await exchange(h,actor)).response.status,303)
  await assert.rejects(h.service.issue(reviewer,h.row.id,'local'),/preview_forbidden/)
  h.row.status='in_review';await exchange(h,reviewer)
  const a=await exchange(h),b=await h.service.issue(owner,h.row.id,'local')
  await assert.rejects(h.service.exchange(a.sessionId,a.issued.preview.fields.ticket),/preview_replayed/)
  await assert.rejects(h.service.exchange(a.sessionId,b.preview.fields.ticket),/preview_expired/)
  const bId=[...h.sessions.keys()].at(-1);h.sessions.get(bId).ticket_expires_at=0
  await assert.rejects(h.service.exchange(bId,b.preview.fields.ticket),/preview_expired/)
  h.sessions.get(a.sessionId).expires_at=new Date(0).toISOString()
  assert.equal((await h.gateway(request(a.origin,'play/start.html',{headers:{Cookie:a.cookie}}))).status,403)
})
for(const name of ['pong','solo'])test('private '+name+' preview serves its real entrypoint and all asset types with a host-only HttpOnly cookie',async()=>{
  const h=await harness(name),{issued,cookie,response,origin}=await exchange(h)
  assert.equal(response.headers.get('location'),issued.launch.entrypointUrl)
  const set=response.headers.get('set-cookie');assert.match(set,new RegExp('^'+PREVIEW_COOKIE+'='));assert.match(set,/HttpOnly/);assert.match(set,/Secure/);assert.match(set,/SameSite=Lax/);assert.doesNotMatch(set,/Domain=/i)
  assert.equal((await h.gateway(request(origin,h.row.manifest.client.entrypoints.local))).status,403)
  for(const [path,mime] of [[h.row.manifest.client.entrypoints.local,'text/html'],['game.js','text/javascript'],['styles.css','text/css'],['engine.wasm','application/wasm'],['assets/world.data','application/octet-stream'],['assets/game.ogg','audio/ogg'],['fonts/game.woff2','font/woff2'],['assets/logo.png','image/png'],['settings.json','application/json']]) {
    const r=await h.gateway(request(origin,path,{headers:{Cookie:cookie}}));assert.equal(r.status,200);assert.ok(r.headers.get('content-type').startsWith(mime));assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-content-type-options'),'nosniff');await r.arrayBuffer()
  }
  assert.ok(h.reads.every(([,key])=>key.startsWith(h.row.storage_prefix)))
})
test('preview rights are checked for every asset; logout-role revocation/status change and cross-game fetches refuse',async()=>{
  const h=await harness(),a=await exchange(h),b=await exchange(h)
  assert.equal((await h.gateway(request(b.origin,'game.js',{headers:{Cookie:a.cookie}}))).status,403)
  assert.equal((await h.gateway(request(a.origin,'game.js',{headers:{Cookie:a.cookie,Origin:b.origin,'Sec-Fetch-Site':'same-site'}}))).status,403)
  const navigation=await h.gateway(request(a.origin,'game.js',{headers:{Cookie:a.cookie,Origin:config.portalOrigins[0],'Sec-Fetch-Dest':'document','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'cross-site'}}))
  assert.equal(navigation.status,200);await navigation.body.cancel()
  h.members.delete(owner);assert.equal((await h.gateway(request(a.origin,'game.js',{headers:{Cookie:a.cookie}}))).status,403)
  h.members.add(owner);h.row.status='archived';assert.equal((await h.gateway(request(a.origin,'game.js',{headers:{Cookie:a.cookie}}))).status,409)
})
test('published is public but draft/approved/archived IDs never authorize public content or cached 304',async()=>{
  const h=await harness('pong','published',true),origin=contentOrigin(config,'public',h.row.id)
  let response=await h.gateway(request(origin,'game.js'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/31536000, immutable/)
  const etag=response.headers.get('etag');await response.body.cancel()
  response=await h.gateway(request(origin,'game.js',{headers:{'If-None-Match':etag}}));assert.equal(response.status,304)
  const html=await h.gateway(request(origin,'index.html'));assert.equal(html.headers.get('cache-control'),'public, no-cache');await html.body.cancel()
  for(const status of ['draft','in_review','approved','rejected','archived']){h.row.status=status;assert.equal((await h.gateway(request(origin,'game.js',{headers:{'If-None-Match':etag}}))).status,404)}
})
test('HEAD and single byte ranges use metadata and stream directly; suffix/If-Range/416/compressed bytes are correct',async()=>{
  const h=await harness('solo','published'),origin=contentOrigin(config,'public',h.row.id)
  const head=await h.gateway(request(origin,'assets/world.data',{method:'HEAD'}));assert.equal(head.status,200);assert.equal(head.body,null);assert.equal(head.headers.get('content-length'),'8');assert.ok(!h.reads.some(([method])=>method==='GET'))
  const partial=await h.gateway(request(origin,'assets/world.data',{headers:{Range:'bytes=2-4'}}))
  assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 2-4/8');assert.equal(partial.headers.get('content-length'),'3');assert.equal(h.pulls,0)
  assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())],[2,3,4])
  const suffix=await h.gateway(request(origin,'assets/world.data',{headers:{Range:'bytes=-2'}}));assert.deepEqual([...new Uint8Array(await suffix.arrayBuffer())],[6,7])
  for(const value of ['bytes=9-10','bytes=4-2','bytes=-0','bytes=0-1,3-4']) {
    const r=await h.gateway(request(origin,'assets/world.data',{headers:{Range:value}}));assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),'bytes */8');assert.match(r.headers.get('cache-control'),/no-store/)
  }
  const full=await h.gateway(request(origin,'assets/world.data',{headers:{Range:'bytes=1-2','If-Range':'"old"'}}));assert.equal(full.status,200);await full.body.cancel()
  const compressed=await h.gateway(request(origin,'engine.js.gz',{headers:{Range:'bytes=0-1'}}));assert.equal(compressed.headers.get('content-encoding'),'gzip');assert.match(compressed.headers.get('content-type'),/text\/javascript/);await compressed.body.cancel()
  const absent=await h.gateway(request(origin,'missing.js',{method:'HEAD'}));assert.equal(absent.status,404);assert.equal(absent.body,null)
})
test('unsafe paths, reserved metadata/archive/staging and service workers never escape the version client namespace',async()=>{
  const h=await harness('solo','published'),origin=contentOrigin(config,'public',h.row.id)
  for(const path of ['../secret','%2e%2e/secret','a%2fb.js','a%5cb.js','a%252fb.js','a%00b.js','a\\b.js','/absolute'])assert.throws(()=>artifactRequestPath(origin+'/'+path),/invalid_artifact_path/)
  for(const path of ['staging/uploads/source.zip','archives/source.zip','inventory.json'])assert.equal((await h.gateway(request(origin,path))).status,404)
  for(const headers of [{'Service-Worker':'script'},{'Sec-Fetch-Dest':'serviceworker'}])assert.equal((await h.gateway(request(origin,'game.js',{headers}))).status,403)
  assert.equal((await h.gateway(request(origin,'game.js',{method:'POST'}))).status,405)
  assert.ok(h.reads.every(([,key])=>key.startsWith(h.row.storage_prefix)))
})
test('security profiles deny external network by default, constrain framing and allow approved WASM/worker capabilities',async()=>{
  const h=await harness('pong','published'),origin=contentOrigin(config,'public',h.row.id)
  let r=await h.gateway(request(origin,'index.html')),csp=r.headers.get('content-security-policy')
  assert.match(csp,/frame-ancestors https:\/\/chibaskogames.fr/);assert.match(csp,/connect-src 'self'\s*;/)
  assert.match(csp,/'wasm-unsafe-eval'/);assert.match(csp,/worker-src 'self' blob:/);assert.doesNotMatch(csp,/'unsafe-eval'/)
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(r.headers.get('cross-origin-resource-policy'),'same-origin');assert.equal(r.headers.get('service-worker-allowed'),null);await r.body.cancel()
  h.row.manifest.client.requirements={crossOriginIsolation:true};assert.equal((await h.gateway(request(origin,'index.html'))).status,503)
  h.row.delivery_policy={profile:'web-isolated-v1',connectOrigins:['wss://game.example.com'],assetOrigins:[]}
  r=await h.gateway(request(origin,'index.html'));assert.equal(r.headers.get('cross-origin-embedder-policy'),'require-corp');assert.equal(r.headers.get('cross-origin-opener-policy'),'same-origin');await r.body.cancel()
  for(const bad of ['*','http://server.example.com','https://localhost','https://example.com/path','https://user@example.com'])assert.throws(()=>validateDeliveryPolicy({profile:'web-v1',connectOrigins:[bad],assetOrigins:[]}),/policy/)
})
test('request logs and failures expose neither grants/cookies nor private R2/DB metadata',async()=>{
  const h=await harness(),x=await exchange(h)
  await h.gateway(request(x.origin,'missing.js?secret=do-not-log',{headers:{Cookie:x.cookie}}))
  const logs=JSON.stringify(h.logs)
  assert.doesNotMatch(logs,/do-not-log|staging|source.zip|ticket|cookie|authorization/i);assert.ok(!logs.includes(x.issued.preview.fields.ticket));assert.ok(!logs.includes(x.cookie))
  const broken=createArtifactGateway(config,{db:h.db,storage:{async head(){throw new Error('private-bucket/staging/key')},async get(){throw new Error()}}})
  const r=await broken(request(x.origin,'game.js',{headers:{Cookie:x.cookie}}));assert.equal(r.status,503);assert.equal((await r.json()).error.code,'storage_error')
})
test('gateway bundles for a browser Worker without Next, SDK, React, Node or game package code',async()=>{
  const result=await build({entryPoints:['cloudflare/artifact-gateway.ts'],bundle:true,platform:'browser',format:'esm',write:false,metafile:true})
  assert.ok(!Object.keys(result.metafile.inputs).some(path=>/node_modules\/(?:next|react|@chibaskogames)|game-server/.test(path)))
})

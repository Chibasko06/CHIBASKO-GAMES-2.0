import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {randomUUID} from 'node:crypto'
import {build} from 'esbuild'
import {ZipWriter,Uint8ArrayWriter,Uint8ArrayReader} from '@zip.js/zip.js'

export async function buildReviewPipelineIntegration(query){
 await import('./admin-register.mjs')
 const {adminBuildRequest}=await import('../lib/server/adminBuilds.ts')
 const {NextRequest}=await import('./admin-next.mjs')
 const {default:Diagnostic}=await import('../components/admin/BuildValidationDiagnostic.tsx')
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server')
 const actor='faed0000-0000-4000-8000-000000000001',admin='faed0000-0000-4000-8000-000000000002'
 await query(`insert into auth.users(id,email) values('${actor}','pipeline-owner@example.test'),('${admin}','pipeline-admin@example.test');insert into admin_users(user_id) values('${admin}')`)
 const game=await query(`select distribution_register_game('${actor}',gen_random_uuid(),'Pipeline fixture')`)
 const policy={revision:1,maxAttempts:3,maxArchiveBytes:1048576,maxTotalBytes:1048576,maxFileBytes:1048576,maxFiles:100,maxManifestBytes:65536,maxCompressionRatio:200,maxPathDepth:32,partBytes:33554432,validationMs:10000,sessionSeconds:86400,signedUrlSeconds:900,jobSeconds:120,maxActiveUploads:2,maxUploadsPerDay:20,maxApiPerMinute:120,redispatchSeconds:3600}
 const literal=v=>v==null?'null':typeof v==='object'?"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb":typeof v==='number'||typeof v==='boolean'?String(v):"'"+String(v).replaceAll("'","''")+"'"
 const rpc=async(name,args)=>{
  assert.match(name,/^distribution_[a-z_]+$/)
  const sql=`select coalesce(to_jsonb(public.${name}(${Object.entries(args).map(([key,value])=>{assert.match(key,/^p_[a-z_]+$/);return key+'=>'+literal(value)}).join(',')})),'null'::jsonb)`
  const raw=await query('begin;set local role service_role;'+sql+';commit;');return JSON.parse(raw||'null')
 }
 const root=await mkdtemp(join(tmpdir(),'chibasko-review-pipeline-')),objects=new Map();let archive,ioFailure=false
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://fixture'),reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
  try{
   if(url.pathname==='/auth/v1/user')return reply(200,{id:admin})
   if(url.pathname==='/rest/v1/admin_users')return reply(200,[{user_id:admin}])
   const chunks=[];for await(const chunk of req)chunks.push(chunk)
   if(url.pathname.startsWith('/r2/')){
    if(req.method==='GET'){res.end(archive);return}
    if(req.method==='HEAD'){res.writeHead(404);res.end();return}
    if(req.method==='PUT'){objects.set(url.pathname,Buffer.concat(chunks));res.end();return}
    throw Error('unexpected_storage_operation')
   }
   const name=url.pathname.split('/').at(-1),args=JSON.parse(Buffer.concat(chunks))
   if(ioFailure&&name==='distribution_checkpoint')throw Error('fixture should fail before checkpoint')
   return reply(200,await rpc(name,args))
  }catch(error){return reply(400,{code:'P0001',message:error.stderr?.match(/(?:forbidden|lease_lost|invalid_state|invalid_request|integration_not_verified|launch_expired|upload_not_found)/)?.[0]??'database_error'})}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port
 const oldEnv={...process.env},oldPhase=globalThis.__phase0
 Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:origin,NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-only'});globalThis.__phase0={admin:{}}
 try{
  await build({entryPoints:['services/build-validator/review.ts','services/build-validator/child.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outdir:'.distribution/review',outExtension:{'.js':'.mjs'},logLevel:'silent'})
  const preload=join(root,'transport.mjs')
  await writeFile(preload,`const original=fetch;globalThis.fetch=(input,init)=>{const req=new Request(input,init),url=new URL(req.url);if(url.hostname.endsWith('.r2.cloudflarestorage.com'))return original(new Request(${JSON.stringify(origin)}+'/r2'+url.pathname,req));if(url.origin!==${JSON.stringify(origin)})throw Error('outbound_forbidden');return original(req)};`)
  for(const [index,kind]of ['headers','manifest','internal','classic'].entries()){
   const version='1.0.'+index,manifest={schemaVersion:1,gameId:game,version,integrationVersion:1,integration:{mode:'classic'},capabilities:{local:{players:{min:1,max:1}}},client:{entrypoints:{local:'index.html'}}}
   const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false})
   await writer.add('chibasko.json',new Uint8ArrayReader(new TextEncoder().encode(JSON.stringify(kind==='manifest'?{gameId:game}:manifest))))
   await writer.add('index.html',new Uint8ArrayReader(new TextEncoder().encode('<!doctype html><title>Classic fixture</title>')))
   if(kind==='headers')await writer.add('_headers',new Uint8ArrayReader(new TextEncoder().encode('/*')))
   archive=await writer.close();ioFailure=kind==='internal'
   const upload=await rpc('distribution_create_upload',{p_actor:actor,p_game:game,p_version:version,p_size:archive.length,p_request:randomUUID(),p_policy:policy})
   await query(`update game_build_uploads set status='queued',staging_etag='fixture' where id='${upload.id}'`)
   // Une panne réelle du processus enfant, sans modifier le parseur de production.
   const childPath=join(root,'missing-child.mjs')
   const command=ioFailure?['--import',pathToFileURL(preload).href,'--input-type=module','-e',`import{processUpload,isolatedExtract}from ${JSON.stringify(pathToFileURL(join(process.cwd(),'.distribution/pipeline-job.mjs')).href)};import{uploadRepository}from ${JSON.stringify(pathToFileURL(join(process.cwd(),'.distribution/pipeline-repository.mjs')).href)};const db=uploadRepository(${JSON.stringify(origin)},'fixture-only');await processUpload('${upload.id}',db,{read:async()=>new Response(Buffer.from('${Buffer.from(archive).toString('base64')}','base64')).body},{},(d,m,s)=>isolatedExtract(d,m,s,${JSON.stringify(childPath)}),{retryTransient:false});`]:['--import',pathToFileURL(preload).href,'.distribution/review/review.mjs',upload.id]
   if(ioFailure)await build({entryPoints:{'pipeline-job':'services/build-validator/job.ts','pipeline-repository':'lib/game-distribution/uploads/repository.ts'},bundle:true,platform:'node',format:'esm',target:'node24',outdir:'.distribution',outExtension:{'.js':'.mjs'},logLevel:'silent'})
   async function run(args){let output='';const child=spawn(process.execPath,args,{windowsHide:true,env:{PATH:oldEnv.PATH,SYSTEMROOT:oldEnv.SYSTEMROOT,SUPABASE_URL:origin,SUPABASE_SERVICE_ROLE_KEY:'fixture-only',GAME_BUILDS_R2_ACCOUNT_ID:'a'.repeat(32),GAME_BUILDS_R2_ACCESS_KEY_ID:'fixture-only',GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-only',GAME_BUILDS_STAGING_BUCKET:'fixture-staging',GAME_BUILDS_ARTIFACTS_BUCKET:'fixture-artifacts',GAME_BUILDS_SCRATCH_DIR:root},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);const timer=setTimeout(()=>child.kill(),45000);const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});clearTimeout(timer);return {code,output}}
   let cli=await run(command)
   if(ioFailure){assert.equal(cli.code,0,cli.output);cli=await run(['--import',pathToFileURL(preload).href,'.distribution/review/review.mjs',upload.id])}
   assert.equal(cli.code,kind==='classic'?0:1,cli.output)
   const state=await rpc('distribution_review_state',{p_id:upload.id});assert.equal(state.attempts,1)
   const response=await adminBuildRequest(new NextRequest('https://portal.test/api/admin/game-builds/'+upload.id,{headers:{Authorization:'Bearer fixture-admin'}}),upload.id)
   assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/)
   const data=(await response.json()).data
   if(kind==='classic'){
    assert.equal(state.status,'completed');assert.equal(data.integration.declaredMode,'classic');assert.equal(data.integration.scan.signals,false);assert.equal(data.integration.observation,null)
    await assert.rejects(rpc('distribution_review_action',{p_actor:admin,p_id:upload.id,p_action:'publish'}),error=>/integration_not_verified/.test(error.stderr))
    const hash='a'.repeat(64),context={gameId:game,gameVersionId:state.gameVersionId,execution:'local',locale:'fr',participants:[]}
    const launch=await rpc('distribution_create_launch',{p_actor:admin,p_game:game,p_version:state.gameVersionId,p_audience:'preview',p_execution:'local',p_capability_hash:'b'.repeat(64),p_control_hash:hash,p_context:context,p_seconds:900,p_actor_limit:60,p_anonymous_limit:600})
    const observation={p_actor:admin,p_id:upload.id,p_launch:launch.id,p_generation:launch.generation,p_control_hash:hash,p_mode:'classic',p_protocol:null}
    await assert.rejects(rpc('distribution_record_integration_observation',{...observation,p_actor:actor}),error=>/forbidden/.test(error.stderr))
    await assert.rejects(rpc('distribution_record_integration_observation',{...observation,p_control_hash:'c'.repeat(64)}),error=>/launch_expired/.test(error.stderr))
    await assert.rejects(rpc('distribution_record_integration_observation',{...observation,p_mode:'sdk',p_protocol:2}),error=>/invalid_request/.test(error.stderr))
    await rpc('distribution_record_integration_observation',observation);await rpc('distribution_record_integration_observation',observation)
    const report=await rpc('distribution_admin_integration',{p_actor:admin,p_id:upload.id});assert.equal(report.observation.mode,'classic');assert.equal(report.observation.protocol,null)
    assert.equal(await query(`select count(*) from game_build_review_events where upload_id='${upload.id}' and action like 'integration_observed:%'`),'1')
    await rpc('distribution_review_action',{p_actor:admin,p_id:upload.id,p_action:'review',p_checklist:{tested:true,content:true,metadata:true,behavior:true}})
    await rpc('distribution_review_action',{p_actor:admin,p_id:upload.id,p_action:'publish'})
    await query(`select distribution_revoke_launch('${launch.id}','${hash}')`)
    await assert.rejects(rpc('distribution_record_integration_observation',observation),error=>/launch_expired/.test(error.stderr))
   }
   else{
    const reason=kind==='headers'?'FORBIDDEN_ARTIFACT_FILE':kind==='manifest'?'INVALID_MANIFEST_SCHEMA':'EXTRACTOR_EXITED'
    assert.equal(state.diagnostic.reason,reason);assert.equal(state.diagnostic.kind,kind==='internal'?'internal':'submission')
    assert.match(cli.output,new RegExp('Code : '+reason))
    const html=renderToStaticMarkup(createElement(Diagnostic,{history:data.history,attempts:data.attempts}))
    if(kind==='headers'){assert.equal(state.diagnostic.path,'_headers');assert.match(cli.output,/_headers/);assert.match(html,/_headers/)}
    if(kind==='manifest'){assert.equal(state.diagnostic.field,'/schemaVersion');assert.match(cli.output,/\/schemaVersion/);assert.match(html,/\/schemaVersion/)}
    if(kind==='internal'){assert.match(cli.output,/incident interne/);assert.match(html,/Erreur interne du validateur/)}
    assert.doesNotMatch(cli.output+html,/fixture-only|control_hash|private transport|stacktrace/)
   }
  }
  for(const role of ['anon','authenticated'])for(const signature of ['distribution_admin_integration(uuid,uuid)','distribution_record_integration_scan(uuid,uuid,jsonb)','distribution_record_integration_observation(uuid,uuid,uuid,uuid,text,text,integer)','distribution_review_action_core(uuid,uuid,text,jsonb,text,uuid)'])assert.equal(await query(`select has_function_privilege('${role}','public.${signature}','execute')`),'f')
  console.log('Review pipeline PASS : ZIP → enfant isolé → parent → PostgreSQL réel → CLI → handler admin → rendu du diagnostic, dès la tentative 1.')
 }finally{
  for(const key of ['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY'])if(oldEnv[key]===undefined)delete process.env[key];else process.env[key]=oldEnv[key]
  globalThis.__phase0=oldPhase;await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})
 }
}

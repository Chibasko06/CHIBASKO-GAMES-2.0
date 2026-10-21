import test from 'node:test'
import assert from 'node:assert/strict'
import {DistributionR2,r2FromEnvironment,r2EnvironmentReport} from '../lib/game-distribution/uploads/r2.ts'
import {developerUploadRequest} from '../lib/server/developerUploads.ts'
import {createUploadService} from '../lib/game-distribution/uploads/service.ts'
import {UPLOAD_POLICY,UploadError} from '../lib/game-distribution/uploads/policy.ts'
import {uploadBuild,SubmissionError} from '../lib/game-distribution/browser-upload.ts'
import {POST as createUploadRoute} from '../app/api/developer/games/[gameId]/uploads/route.ts'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requestKey='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const config={accountId:'a'.repeat(32),accessKeyId:'fixture-private-access',secretAccessKey:'fixture-private-secret',bucket:'fixture-staging'}
const names=['GAME_BUILDS_R2_ACCOUNT_ID','GAME_BUILDS_R2_ACCESS_KEY_ID','GAME_BUILDS_R2_SECRET_ACCESS_KEY','GAME_BUILDS_STAGING_BUCKET']
const environment=()=>Object.fromEntries(names.map((name,index)=>[name,Object.values(config)[index]]))
const request=()=>new Request('https://portal.example/api/developer/games/'+id+'/uploads',{method:'POST',headers:{Authorization:'Bearer fixture-private-token','Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify({version:'0.3.0',archiveSize:8})})

test('actual POST route parses the browser JSON and reaches the real repository for 0.3.1',async()=>{
 const gameId='0509712e-589d-433d-8395-fa4bcf25c55f',originalFetch=globalThis.fetch,originalR2=globalThis.__r2
 const environment={NEXT_PUBLIC_SUPABASE_URL:'https://database.example.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-server',GAME_DISTRIBUTION_UPLOADS_ENABLED:'1',GAME_BUILDS_R2_ACCOUNT_ID:'a'.repeat(32),GAME_BUILDS_R2_ACCESS_KEY_ID:'fixture-access',GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-secret',GAME_BUILDS_STAGING_BUCKET:'fixture-staging'}
 const previous=Object.fromEntries(Object.keys(environment).map(key=>[key,process.env[key]]));Object.assign(process.env,environment)
 const calls=[];let multipart=0
 globalThis.__r2={context:{env:{GAME_BUILDS_STAGING:{createMultipartUpload:async()=>{multipart++;return {uploadId:'fixture-multipart'}},resumeMultipartUpload(){},head(){},delete(){}}}}}
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:input)
  assert.equal(url.origin,environment.NEXT_PUBLIC_SUPABASE_URL)
  if(url.pathname==='/auth/v1/user')return Response.json({id,email:'fixture@example.test'})
  const name=url.pathname.split('/').at(-1),args=JSON.parse(init.body);calls.push({name,args})
  const row={id,game_id:gameId,version:args.p_version??'0.3.1',expected_size:144377,policy:UPLOAD_POLICY,staging_key:'private/fixture.zip',status:'created'}
  if(name==='distribution_create_upload'){assert.equal(args.p_game,gameId);assert.equal(args.p_version,'0.3.1');assert.equal(args.p_size,144377);return Response.json(row)}
  assert.equal(name,'distribution_attach_transport');return Response.json({...row,status:'uploading',multipart_id:args.p_multipart})
 }
 try{
  const body=JSON.stringify({version:'0.3.1',archiveSize:144377});assert.equal(Buffer.byteLength(body),40)
  const response=await createUploadRoute(new Request('https://portal.example/api/developer/games/'+gameId+'/uploads',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json','Idempotency-Key':requestKey},body}),{params:Promise.resolve({gameId})})
  assert.equal(response.status,201);assert.equal(response.headers.get('X-Upload-Contract'),'semver-schema-v2')
  const result=await response.text();assert.match(result,/0\.3\.1/);assert.doesNotMatch(result,/fixture-server|private\/|multipart_id|fixture-multipart/)
  assert.equal(calls.length,2);assert.equal(multipart,1)
 }finally{globalThis.fetch=originalFetch;globalThis.__r2=originalR2;for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value}}
})

test('version failures have bounded input diagnostics and precise failure stages without request credentials',async()=>{
 const logs=[]
 const req=new Request('https://portal.example/api/developer/games/'+id+'/uploads',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey,Authorization:'Bearer must-never-log'},body:JSON.stringify({version:'0.3.1\u200b',archiveSize:144377})})
 const response=await developerUploadRequest(req,'create',id,{authenticate:async()=>id,service:(_id,phase)=>createUploadService({call:()=>assert.fail('No RPC for invalid version')},{},phase),log:e=>logs.push(e)})
 assert.equal(response.status,400);assert.equal(logs[0].phase,'version_validation');assert.equal(logs[0].input.versionType,'string');assert.equal(logs[0].input.versionLength,6);assert.equal(logs[0].input.versionHasNonAscii,true)
 assert.equal(logs[0].input.version,undefined);assert.doesNotMatch(JSON.stringify(logs),/must-never-log|bbbbbbbb|Authorization/)
})

test('valid version never masks archive, repository or unexpected failures as invalid_version',async()=>{
 for(const scenario of [
  {size:0,code:'invalid_archive_size',status:400,phase:'archive_size_validation'},
  {size:144377,code:'version_conflict',status:409,phase:'upload_repository_create'},
  {size:144377,code:'forbidden',status:403,phase:'upload_repository_create'},
  {size:144377,code:'database_error',status:503,phase:'upload_repository_create'},
  {size:144377,code:'service_unavailable',status:503,phase:'upload_repository_create',unexpected:true}
 ]){
  const logs=[]
  const req=new Request('https://portal.example/api/developer/games/'+id+'/uploads',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify({version:'0.3.1',archiveSize:scenario.size})})
  const response=await developerUploadRequest(req,'create',id,{authenticate:async()=>id,service:(_id,phase)=>createUploadService({call:async()=>{throw scenario.unexpected?Error('fixture-private-transport'):new UploadError(scenario.code,scenario.status)}},{},phase),log:e=>logs.push(e)})
  assert.equal(response.status,scenario.status);assert.deepEqual(await response.json(),{error:{code:scenario.code}})
  assert.equal(logs[0].phase,scenario.phase);assert.equal(logs[0].input.version,'0.3.1');assert.equal(logs[0].contractRevision,'semver-schema-v2')
  assert.doesNotMatch(JSON.stringify(logs),/fixture-private-transport/)
 }
})

test('upload HTTP admission accepts patch releases for an existing game and rejects malformed SemVer before storage',async()=>{
 const gameId='0509712e-589d-433d-8395-fa4bcf25c55f'
 for(const version of ['0.3.1','1.0.0','2.4.12','0.3','v0.3.1','0.3.1.0','abc',' 0.3.1 ','01.3.1','0.3.1\n']){
  let calls=0,begins=0
  const valid=['0.3.1','1.0.0','2.4.12'].includes(version)
  const db={async call(name,args){
   calls++;assert.equal(name,'distribution_create_upload');assert.equal(args.p_game,gameId);assert.equal(args.p_version,version)
   // Existing game, active version 0.3.0; version uniqueness remains a database responsibility.
   return {id,game_id:gameId,version,status:'uploading',expected_size:8,policy:UPLOAD_POLICY,multipart_id:'fixture-only'}
  }}
  const req=new Request('https://portal.example/api/developer/games/'+gameId+'/uploads',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestKey},body:JSON.stringify({version,archiveSize:8})})
  const response=await developerUploadRequest(req,'create',gameId,{authenticate:async()=>id,service:()=>createUploadService(db,{begin:async()=>{begins++;return 'fixture'}})})
  const body=await response.json()
  assert.equal(response.status,valid?201:400,version)
  if(valid){assert.equal(body.data.version,version);assert.equal(body.data.gameId,gameId)}else assert.equal(body.error.code,'invalid_version',version)
  assert.equal(calls,valid?1:0);assert.equal(begins,0)
 }
})
test('missing environment reproduces pre-multipart 503; only names and request correlation reach logs',async()=>{
 const logs=[];let factory=0
 const response=await developerUploadRequest(request(),'create',id,{authenticate:async()=>id,service:()=>{factory++;return createUploadService({call:()=>assert.fail('No database write')},r2FromEnvironment({},'STAGING'))},log:event=>logs.push(event)})
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'service_unavailable'}})
 assert.equal(factory,1);assert.deepEqual(logs[0].r2Configuration,{present:[],missing:names,invalid:[]})
 assert.equal(logs[0].phase,'service_configuration');assert.equal(logs[0].requestId,response.headers.get('X-Request-Id'))
 assert.doesNotMatch(JSON.stringify(logs),/fixture-private|Bearer|staging\/uploads|multipart_id|lease_token/)
 for(const name of names){const env=environment();delete env[name];assert.deepEqual(r2EnvironmentReport(env,'STAGING').missing,[name])}
 const bad=environment();bad.GAME_BUILDS_R2_ACCOUNT_ID='fixture-invalid';bad.GAME_BUILDS_R2_ACCESS_KEY_ID+='\n'
 assert.deepEqual(r2EnvironmentReport(bad,'STAGING').invalid,['GAME_BUILDS_R2_ACCOUNT_ID','GAME_BUILDS_R2_ACCESS_KEY_ID'])
 assert.doesNotThrow(()=>r2FromEnvironment(environment(),'STAGING'))
 assert.deepEqual(r2EnvironmentReport({...environment(),GAME_BUILDS_ARTIFACTS_BUCKET:'fixture-artifacts'},'ARTIFACTS').missing,[])
})
function database(){
 let row
 return {get row(){return row},async call(name,args){
   if(name==='distribution_create_upload'){
     assert.equal(args.p_request,requestKey)
     row??={id,game_id:id,version:'0.3.0',status:'created',expected_size:8,policy:UPLOAD_POLICY,staging_key:'staging/uploads/'+id+'/source.zip',multipart_id:null}
   }else if(name==='distribution_attach_transport'){row.status='uploading';row.multipart_id=args.p_multipart}
   else assert.fail(name)
   return structuredClone(row)
 }}
}
test('R2 refusal retains status and allowlisted code, never raw error text; retry reuses created DB upload',async()=>{
 const db=database(),logs=[]
 const refused=new DistributionR2(config,async()=>new Response('<Error><Code>AccessDenied</Code><Message>fixture-private-secret staging/uploads/private?uploadId=private</Message></Error>',{status:403}))
 const response=await developerUploadRequest(request(),'create',id,{authenticate:async()=>id,service:()=>createUploadService(db,refused),log:e=>logs.push(e)})
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'storage_error'}})
 assert.deepEqual(logs[0].r2,{kind:'http_error',action:'multipart_create',upstreamStatus:403,r2Code:'AccessDenied'})
 assert.doesNotMatch(JSON.stringify(logs),/fixture-private|uploadId|staging\/uploads|Authorization/)
 assert.equal(db.row.status,'created')
 const recovered=new DistributionR2(config,async()=>new Response('<InitiateMultipartUploadResult><UploadId>fixture-transport</UploadId></InitiateMultipartUploadResult>'))
 const result=await createUploadService(db,recovered).create(id,id,{version:'0.3.0',archiveSize:8},requestKey)
 assert.equal(result.id,id);assert.equal(result.status,'uploading')
 assert.doesNotMatch(JSON.stringify(result),/staging_key|fixture-transport|multipart_id/)
})
test('network, timeout, malformed multipart XML and unapproved error codes stay diagnosable without sensitive messages',async()=>{
 const network=new DistributionR2(config,async()=>{throw Error('fixture-private-secret')})
 await assert.rejects(network.begin('private/key'),error=>error.code==='storage_error'&&error.diagnostic.kind==='network_error'&&!JSON.stringify(error).includes('fixture-private'))
 const original=AbortSignal.timeout;AbortSignal.timeout=()=>AbortSignal.abort()
 try{await assert.rejects(network.begin('private/key'),error=>error.diagnostic.kind==='timeout')}finally{AbortSignal.timeout=original}
 const malformed=new DistributionR2(config,async()=>new Response('<InitiateMultipartUploadResult/>'))
 await assert.rejects(malformed.begin('private/key'),error=>error.diagnostic.kind==='invalid_response')
 const untrusted=new DistributionR2(config,async()=>new Response('<Error><Code>FixturePrivateSecret</Code><Message>fixture-private-secret</Message></Error>',{status:403}))
 await assert.rejects(untrusted.begin('private/key'),error=>error.diagnostic.upstreamStatus===403&&error.diagnostic.r2Code===undefined)
 const loggerFailure=await developerUploadRequest(request(),'create',id,{authenticate:async()=>id,service:()=>{throw new UploadError('storage_error',503)},log:()=>{throw Error('fixture logger')}})
 assert.equal(loggerFailure.status,503)
})
test('client keeps idempotency request and identity after a pre-upload failure and can retry the same ZIP',async()=>{
 const file=new File(['abcdefgh'],'fixture.zip',{lastModified:1})
 const draft={requestId:requestKey,gameId:id,version:'0.3.0',name:file.name,size:8,lastModified:1,hashes:{}}
 const sent=[];let failed=true
 const deps={save:()=>{},progress:()=>{},put:async()=>{},api:async(path,init={})=>{
   if(path.endsWith('/uploads')){sent.push(init.headers['Idempotency-Key']);if(failed){failed=false;throw new SubmissionError('service_unavailable')}
     return {data:{id,status:'uploading',upload:{partSize:32}}}}
   if(path.endsWith('/parts'))return {data:{parts:init.method==='POST'?[{url:'https://fixture.example',headers:{}}]:[]}}
   if(path.endsWith('/finalize'))return {data:{status:'queued'}}
   assert.fail(path)
 }}
 await assert.rejects(uploadBuild(file,draft,new AbortController().signal,deps),{code:'service_unavailable'})
 assert.equal(draft.uploadId,undefined);assert.equal(draft.gameId,id)
 assert.equal(await uploadBuild(file,draft,new AbortController().signal,deps),id)
 assert.deepEqual(sent,[requestKey,requestKey])
})

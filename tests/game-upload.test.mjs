import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from '@zip.js/zip.js'
import { UPLOAD_POLICY, UploadError } from '../lib/game-distribution/uploads/policy.ts'
import { createUploadService } from '../lib/game-distribution/uploads/service.ts'
import { publicUpload } from '../lib/game-distribution/uploads/contracts.ts'
import { DistributionR2 } from '../lib/game-distribution/uploads/r2.ts'
import { developerUploadRequest } from '../lib/server/developerUploads.ts'
import { processUpload, isolatedExtract } from '../services/build-validator/job.ts'
import { extractCommand } from '../services/build-validator/extract.ts'
import { dispatchUploads, cleanupUploads, CloudflarePullQueue } from '../services/build-validator/queue.ts'
import { validateWebBuildZip } from '../lib/game-distribution/zip.ts'

const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const encoder=new TextEncoder()
async function fixture(name) {
  const directory=new URL('./fixtures/game-builds/'+name+'/',import.meta.url)
  const manifest=JSON.parse(await readFile(new URL('chibasko.json',directory),'utf8'))
  const path=Object.values(manifest.client.entrypoints)[0]
  return {manifest,files:[{path:'chibasko.json',bytes:encoder.encode(JSON.stringify(manifest))},{path,bytes:new Uint8Array(await readFile(new URL(path,directory)))}]}
}
async function zipped(files,options={}) {
  const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,...options})
  for(const file of files)await writer.add(file.path,new Uint8ArrayReader(file.bytes),options)
  return writer.close()
}
function harness(manifest,bytes) {
  let row,claim=0,completeFailure=false
  const versions=new Map(),objects=new Map(),removed=[],parts=[];let assembled=false,puts=0
  const db={async call(name,args){
    if(args.p_actor && args.p_actor!==owner)throw new UploadError(name==='distribution_create_upload'?'forbidden':'upload_not_found',name==='distribution_create_upload'?403:404)
    switch(name){
      case 'distribution_create_upload':
        if(row)return structuredClone(row)
        row={id:randomUUID(),version_id:randomUUID(),game_id:manifest.gameId,version:manifest.version,created_by:owner,
          expected_size:bytes.length,policy:UPLOAD_POLICY,expires_at:new Date(Date.now()+86400000).toISOString(),status:'created',multipart_id:null,
          staging_key:'',staging_etag:null,attempts:0,lease_token:null,checkpoint:null,error_code:null};row.staging_key='staging/uploads/'+row.id+'/source.zip';break
      case 'distribution_get_upload':if(!row || args.p_id!==row.id)throw new UploadError('upload_not_found',404);break
      case 'distribution_attach_transport':if(row.status==='created'){row.multipart_id=args.p_multipart;row.status='uploading'}break
      case 'distribution_begin_finalize':if(row.status==='uploading')row.status='finalizing';break
      case 'distribution_resume_upload':row.status='uploading';break
      case 'distribution_enqueue_upload':row.status='queued';row.staging_etag=args.p_etag;break
      case 'distribution_claim':if(row.status!=='queued')return null;row.status='validating';row.lease_token=String(++claim);row.attempts++;break
      case 'distribution_checkpoint':row.checkpoint=args.p_checkpoint;break
      case 'distribution_complete':if(completeFailure){completeFailure=false;throw new UploadError('database_error',503)}
        if(versions.has(row.game_id+row.version)){row.status='failed';row.error_code='version_conflict'}
        else{versions.set(row.game_id+row.version,{...row.checkpoint,status:'draft'});row.status='completed'}break
      case 'distribution_fail':row.status=args.p_retry?'queued':'failed';row.error_code=args.p_code;break
      case 'distribution_pending':return row.status==='queued'?[row]:[]
      case 'distribution_cleanup_candidates':return ['completed','failed','expired'].includes(row.status)?[row]:[]
      case 'distribution_dispatched':return
      case 'distribution_cleaned':row.cleaned_at=new Date().toISOString();return
      default:throw new Error(name)
    }
    return structuredClone(row)
  }}
  const staging={async begin(){return 'opaque-r2-multipart'},async signPart(){return 'https://staging.example/part'},
    async parts(){return parts},async complete(){assembled=true},async head(){return assembled?{size:bytes.length,etag:'frozen-etag'}:null},
    async abort(){},async delete(key){removed.push(key)},async read(key,etag){assert.equal(key,row.staging_key);assert.equal(etag,'frozen-etag');return new ReadableStream({start(c){c.enqueue(bytes);c.close()}})}}
  const artifacts={async metadata(key){return objects.get(key)?.metadata ?? null},bucket(){return {async put(key,body,options){
    assert.equal(options.onlyIf.get('If-None-Match'),'*');if(objects.has(key))return null
    const data=body instanceof Uint8Array?body:new Uint8Array(await new Response(body).arrayBuffer())
    objects.set(key,{data,metadata:{size:data.length,sha256:options.customMetadata.sha256}});puts++;return {}
  }}},async *keys(prefix){for(const key of objects.keys())if(key.startsWith(prefix))yield key},async delete(key){objects.delete(key)}}
  return {db,staging,artifacts,versions,objects,removed,service:createUploadService(db,staging),get row(){return row},get puts(){return puts},
    finishParts(){parts.push({number:1,size:bytes.length,etag:'abc'})},failCommit(){completeFailure=true}}
}
async function upload(h,manifest) {
  return h.service.create(owner,manifest.gameId,{version:manifest.version,archiveSize:h.row?.expected_size ?? h.size},randomUUID())
}
async function setup(name='solo') {
  const {manifest,files}=await fixture(name),bytes=await zipped(files),h=harness(manifest,bytes);h.size=bytes.length
  await upload(h,manifest);return {h,manifest,files,bytes}
}
test('HTTP API authenticates, authorizes each operation, rejects cross-origin and leaks no storage internals',async()=>{
  const {h,manifest}=await setup()
  const request=(token,method='GET',origin)=>new Request('https://platform.example/api/developer/uploads/'+h.row.id,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})}})
  const deps={async authenticate(r){const token=r.headers.get('authorization');if(!token)throw new UploadError('unauthorized',401);return token==='Bearer owner'?owner:other},service(){return h.service}}
  assert.equal((await developerUploadRequest(request(),'status',h.row.id,deps)).status,401)
  assert.equal((await developerUploadRequest(request('other'),'status',h.row.id,deps)).status,404)
  const status=await developerUploadRequest(request('owner'),'status',h.row.id,deps)
  assert.equal(status.status,200);assert.match(status.headers.get('cache-control'),/no-store/)
  assert.doesNotMatch(JSON.stringify(await status.json()),/staging_key|multipart_id|lease_token|checkpoint|created_by/)
  assert.equal((await developerUploadRequest(request('owner','POST','https://evil.example'),'finalize',h.row.id,deps)).status,403)
  await assert.rejects(h.service.create(other,manifest.gameId,{version:manifest.version,archiveSize:100},randomUUID()),/forbidden/)
  await assert.rejects(h.service.create(owner,manifest.gameId,{version:manifest.version,archiveSize:100,owner:other},randomUUID()),/invalid_request/)
})
test('multipart is resumable; incomplete/expired/finalized sessions refuse signing and finalize retries are idempotent',async()=>{
  const {h}=await setup(),id=h.row.id
  await assert.rejects(h.service.finalize(owner,id),/upload_incomplete/)
  assert.equal(h.row.status,'uploading')
  const signed=await h.service.parts(owner,id,[1]);assert.equal(signed.parts[0].headers['Content-Length'],String(h.size))
  await assert.rejects(h.service.parts(owner,id,[0]),/invalid_part/)
  await assert.rejects(h.service.parts(owner,id,[1,1]),/invalid_request/)
  h.finishParts();await Promise.all([h.service.finalize(owner,id),h.service.finalize(owner,id)])
  assert.equal(h.row.status,'queued');assert.equal((await h.service.finalize(owner,id)).status,'queued')
  await assert.rejects(h.service.parts(owner,id,[1]),/invalid_state/)
  h.row.status='expired';await assert.rejects(h.service.finalize(owner,id),/upload_expired/)
})
for(const name of ['pong','solo'])test('streamed validation stores immutable files, original ZIP and draft for '+name,async()=>{
  const {h,manifest,bytes}=await setup(name)
  h.finishParts();await h.service.finalize(owner,h.row.id)
  const sent=[];await dispatchUploads(h.db,async id=>sent.push(id));assert.deepEqual(sent,[h.row.id])
  await processUpload(h.row.id,h.db,h.staging,h.artifacts,async dir=>extractCommand(dir))
  assert.equal(h.row.status,'completed');assert.equal(h.versions.size,1)
  const version=[...h.versions.values()][0];assert.equal(version.status,'draft')
  const memory=await validateWebBuildZip(bytes,{gameId:manifest.gameId,version:manifest.version})
  assert.equal(version.artifactSha256,memory.artifactSha256)
  assert.ok([...h.objects.keys()].some(key=>key.endsWith('/inventory.json')))
  assert.ok([...h.objects.keys()].some(key=>key.endsWith('.zip')))
  assert.equal(publicUpload(h.row).gameVersionId,h.row.version_id)
  const count=h.puts;await processUpload(h.row.id,h.db,h.staging,h.artifacts,extractCommand);assert.equal(h.puts,count)
  await cleanupUploads(h.db,h.staging,h.artifacts);assert.ok(h.objects.size);assert.deepEqual(h.removed,[h.row.staging_key])
})
test('online-only public/private combinations use exactly the same upload pipeline',async()=>{
  const source=await fixture('pong')
  for(const access of [['public'],['private'],['public','private']]) {
    const manifest=structuredClone(source.manifest);delete manifest.capabilities.local;delete manifest.client.entrypoints.local
    manifest.capabilities.online.access=access;manifest.capabilities.online.players={min:2,max:4}
    const files=source.files.map(f=>f.path==='chibasko.json'?{...f,bytes:encoder.encode(JSON.stringify(manifest))}:f)
    const bytes=await zipped(files),h=harness(manifest,bytes);h.size=bytes.length;await upload(h,manifest)
    h.finishParts();await h.service.finalize(owner,h.row.id);await processUpload(h.row.id,h.db,h.staging,h.artifacts,extractCommand)
    assert.equal(h.row.status,'completed');assert.equal(h.row.checkpoint.manifest.capabilities.local,undefined)
  }
})
test('DB outage after R2 writes retries without overwrite; version conflict cleans only its orphan prefix',async()=>{
  const {h}=await setup();h.finishParts();await h.service.finalize(owner,h.row.id);h.failCommit()
  await processUpload(h.row.id,h.db,h.staging,h.artifacts,extractCommand)
  assert.equal(h.row.status,'queued');assert.equal(h.versions.size,0);const puts=h.puts
  await processUpload(h.row.id,h.db,h.staging,h.artifacts,extractCommand)
  assert.equal(h.row.status,'completed');assert.equal(h.puts,puts)
  const {h:loser,manifest}=await setup()
  loser.versions.set(manifest.gameId+manifest.version,{status:'draft'})
  loser.finishParts();await loser.service.finalize(owner,loser.row.id)
  await processUpload(loser.row.id,loser.db,loser.staging,loser.artifacts,extractCommand)
  assert.equal(loser.row.error_code,'version_conflict')
  await cleanupUploads(loser.db,loser.staging,loser.artifacts);assert.equal(loser.objects.size,0)
  assert.ok(h.objects.size,'completed version is untouched')
})
test('partial extraction storage failure retries safely; parser timeout never creates a version',async()=>{
  const {h}=await setup();h.finishParts();await h.service.finalize(owner,h.row.id)
  const normal=h.artifacts.bucket.bind(h.artifacts);let first=true
  h.artifacts.bucket=(signal)=>{const bucket=normal(signal);return {async put(...args){
    const result=await bucket.put(...args);if(first){first=false;throw new UploadError('storage_error',503)}return result
  }}}
  await processUpload(h.row.id,h.db,h.staging,h.artifacts,extractCommand)
  assert.equal(h.row.status,'queued');assert.equal(h.versions.size,0);assert.equal(h.objects.size,1)
  await processUpload(h.row.id,h.db,h.staging,h.artifacts,extractCommand)
  assert.equal(h.row.status,'completed')
  const {h:timed}=await setup();timed.finishParts();await timed.service.finalize(owner,timed.row.id)
  await processUpload(timed.row.id,timed.db,timed.staging,timed.artifacts,async()=>{throw new UploadError('validation_timeout',422)})
  assert.equal(timed.row.status,'queued');assert.equal(timed.row.error_code,'validation_timeout');assert.equal(timed.versions.size,0)
})
test('Cloudflare pull/ack uses bounded batches, text JSON messages and no archive in the queue',async()=>{
  const calls=[];const queue=new CloudflarePullQueue('a'.repeat(32),'b'.repeat(32),'fixture-only',async(url,init)=>{
    calls.push([url,JSON.parse(init.body)]);return Response.json({success:true,result:{messages:[]}})})
  await queue.pull();await queue.acknowledge('opaque-lease',true)
  assert.equal(calls[0][1].batch_size,1);assert.equal(calls[0][1].visibility_timeout_ms,7200000)
  assert.equal(calls[1][1].retries[0].delay_seconds,60)
})
test('real R2 adapter signs only a multipart part, binds exact length and verifies server-side parts',async()=>{
  const calls=[]
  const storage=new DistributionR2({accountId:'a'.repeat(32),accessKeyId:'fixture-only',secretAccessKey:'fixture-only',bucket:'private-staging'},async request=>{
    calls.push(request)
    const url=new URL(request.url)
    if(request.method==='POST' && url.searchParams.has('uploads'))return new Response('<InitiateMultipartUploadResult><UploadId>opaque-id</UploadId></InitiateMultipartUploadResult>')
    if(request.method==='GET')return new Response('<ListPartsResult><Part><PartNumber>1</PartNumber><Size>100</Size><ETag>"abc"</ETag></Part><IsTruncated>false</IsTruncated></ListPartsResult>')
    return new Response('<CompleteMultipartUploadResult/>')
  })
  const key='staging/uploads/'+randomUUID()+'/source.zip',multipart=await storage.begin(key)
  const signed=new URL(await storage.signPart(key,multipart,1,100,60))
  assert.equal(signed.searchParams.get('uploadId'),'opaque-id');assert.equal(signed.searchParams.get('partNumber'),'1')
  assert.equal(signed.searchParams.get('X-Amz-Expires'),'60');assert.match(signed.searchParams.get('X-Amz-SignedHeaders'),/content-length/)
  const parts=await storage.parts(key,multipart);assert.deepEqual(parts,[{number:1,size:100,etag:'"abc"'}])
  await storage.complete(key,multipart,parts);assert.equal(calls.length,3)
})
test('real isolated parser runs without inherited platform credentials and uses the shared validation contract',async()=>{
  const {files,manifest}=await fixture('solo'),root=resolve(tmpdir()),directory=await mkdtemp(join(root,'chibasko-upload-test-'))
  try{
    await writeFile(join(directory,'archive.zip'),await zipped(files))
    await writeFile(join(directory,'request.json'),JSON.stringify({target:{gameId:manifest.gameId,version:manifest.version},policy:UPLOAD_POLICY}))
    await isolatedExtract(directory,10000,AbortSignal.timeout(15000),resolve('.distribution/validator/child.mjs'))
    const result=JSON.parse(await readFile(join(directory,'result.json'),'utf8'))
    assert.equal(result.checkpoint.manifest.gameId,manifest.gameId)
  }finally{assert.ok(resolve(directory).startsWith(root+sep+'chibasko-upload-test-'));await rm(directory,{recursive:true,force:true})}
})
test('streamed worker rejects malformed, spoofed, unsupported and dangerous builds before any final object/version',async t=>{
  const {files,manifest}=await fixture('solo')
  const mutate=change=>{const m=structuredClone(manifest);change(m);return files.map(f=>f.path==='chibasko.json'?{...f,bytes:encoder.encode(JSON.stringify(m))}:f)}
  const cases=[['missing manifest',files.slice(1)],['missing entrypoint',files.slice(0,1)],
    ['schema',mutate(m=>m.capabilities={})],['game spoof',mutate(m=>m.gameId=randomUUID())],['version',mutate(m=>m.version='bad')],
    ['schema version',mutate(m=>m.schemaVersion=2)],['integration version',mutate(m=>m.integrationVersion=2)],
    ['traversal',[...files,{path:'../escape.js',bytes:encoder.encode('x')}]],['symlink',files,{unixMode:0o120777}],
    ['encrypted',files,{password:'fixture-only'}],['bomb',[...files,{path:'bomb.bin',bytes:new Uint8Array(100000)}]]]
  for(const [name,list,options] of cases)await t.test(name,async()=>{
    const bytes=await zipped(list,options),h=harness(manifest,bytes);h.size=bytes.length;await upload(h,manifest)
    h.finishParts();await h.service.finalize(owner,h.row.id)
    await processUpload(h.row.id,h.db,h.staging,h.artifacts,extractCommand)
    assert.equal(h.row.status,'failed');assert.equal(h.row.error_code,'validation_failed');assert.equal(h.versions.size,0);assert.equal(h.objects.size,0)
  })
})

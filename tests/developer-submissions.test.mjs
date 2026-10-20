import test from 'node:test'
import assert from 'node:assert/strict'
import {developerSubmissionRequest,editorialInput} from '../lib/server/developerSubmissions.ts'
import {uploadBuild,zipFileAllowed,SubmissionError} from '../lib/game-distribution/browser-upload.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
import {UPLOAD_POLICY} from '../lib/game-distribution/uploads/policy.ts'
import {createUploadService} from '../lib/game-distribution/uploads/service.ts'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test('500 MiB archive policy is shared by catalogue, client and server; extraction stays 16 GiB',async()=>{
 assert.equal(UPLOAD_POLICY.maxArchiveBytes,524288000)
 assert.equal(UPLOAD_POLICY.maxTotalBytes,16*1024**3)
 const response=await developerSubmissionRequest(new Request('https://site.example/api/developer/games'),'games',{
   authenticate:async()=>id,enabled:()=>true,db:()=>({call:async()=>[]})
 })
 const limit=(await response.json()).maxArchiveBytes
 assert.equal(limit,524288000)
 assert.equal(zipFileAllowed({name:'fixture.zip',size:limit},limit),true)
 assert.equal(zipFileAllowed({name:'fixture.zip',size:limit+1},limit),false)
 let calls=0
 const service=createUploadService({call:async(name,args)=>{
   calls++;assert.equal(name,'distribution_create_upload');assert.equal(args.p_policy.maxArchiveBytes,limit)
   assert.equal(args.p_size,limit)
   return {id,game_id:id,version:'1.0.0',status:'uploading',expected_size:limit,policy:args.p_policy}
 }},{})
 await service.create(id,id,{version:'1.0.0',archiveSize:limit},id)
 await assert.rejects(service.create(id,id,{version:'1.0.0',archiveSize:limit+1},id),{code:'invalid_request'})
 assert.equal(calls,1)
})
test('anonymous refused; verified actor only; private-safe catalog and editorial input',async()=>{
 const request=new Request('https://site.example/api/developer/games')
 assert.equal((await developerSubmissionRequest(request,'games',{authenticate:async()=>{throw new UploadError('unauthorized',401)},db:()=>assert.fail(),enabled:()=>true})).status,401)
 const calls=[],deps={authenticate:async()=>id,enabled:()=>true,db:()=>({call:async(name,args)=>{calls.push({name,args});return name==='distribution_register_game'?id:[]}})}
 const response=await developerSubmissionRequest(request,'games',deps);assert.equal(response.status,200);assert.equal(calls[0].args.p_actor,id)
 assert.doesNotMatch(await response.text(),/staging_key|multipart_id|lease_token|checkpoint|service_role/)
 const create=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({title:'Test'})})
 assert.equal((await developerSubmissionRequest(create,'games',deps)).status,201)
 assert.equal(calls[1].name,'distribution_register_game')
 assert.throws(()=>editorialInput({uploadId:id,title:'Test',description:'Test',categories:[],website:'javascript:evil',ownership:true}))
 assert.throws(()=>editorialInput({uploadId:id,title:'Test',description:'Test',categories:[],website:'',ownership:true,created_by:id}))
 assert.equal(editorialInput({uploadId:id,title:'Test',description:'Test',categories:[],website:'',ownership:true}).p_upload,id)
 const denied={...deps,db:()=>({call:async()=>{throw new UploadError('forbidden',403)}})}
 assert.equal((await developerSubmissionRequest(request,'games',denied)).status,403)
})
test('direct multipart progress, resume hashes, finalization and no ZIP in portal request',async()=>{
 const file=new File(['abcdefgh'], 'fixture.zip',{lastModified:1}),draft={requestId:id,gameId:id,version:'1.0.0',name:file.name,size:file.size,lastModified:1,hashes:{}}
 let puts=0,finalized=false,remote=[],progress=0
 const deps={save:()=>{},progress:n=>{progress=n},put:async(url,headers,blob,report)=>{assert.equal(url,'https://signed.example');puts++;report(blob.size)},api:async(path,init={})=>{
   assert.ok(!init.body||typeof init.body==='string')
   if(path.endsWith('/finalize')){finalized=true;return{data:{status:'queued'}}}
   if(path.endsWith('/parts'))return init.method==='POST'?{data:{parts:[{url:'https://signed.example',headers:{}}]}}:{data:{parts:remote}}
   return {data:{id,status:'uploading',upload:{partSize:4}}}
 }}
 assert.equal(await uploadBuild(file,draft,new AbortController().signal,deps),id);assert.equal(puts,2);assert.equal(progress,8);assert.ok(finalized)
 remote=[{number:1,size:4},{number:2,size:4}];puts=0
 await uploadBuild(file,draft,new AbortController().signal,deps);assert.equal(puts,0)
 delete draft.hashes['2'];await uploadBuild(file,draft,new AbortController().signal,deps);assert.equal(puts,1)
 const changed=new File(['abcdefgh'],'other.zip',{lastModified:1});await assert.rejects(uploadBuild(changed,draft,new AbortController().signal,deps),{code:'file_changed'})
 await assert.rejects(uploadBuild(file,draft,new AbortController().signal,{...deps,api:async()=>{throw new SubmissionError('version_conflict')}}),{code:'version_conflict'})
 assert.equal(zipFileAllowed(file,7),false);assert.equal(zipFileAllowed(file,8),true);assert.equal(zipFileAllowed({name:'evil.js',size:8},8),false)
 await assert.rejects(uploadBuild(file,draft,new AbortController().signal,{...deps,api:async(path,init)=>{
   if(path.endsWith('/finalize'))throw new Error('fixture unavailable')
   return deps.api(path,init)
 }}),{code:'finalization_failed'})
 let requests=0
 assert.equal(await uploadBuild(file,draft,new AbortController().signal,{...deps,api:async()=>{requests++;return {data:{id,status:'queued'}}},put:()=>assert.fail('Already finalized')}),id)
 assert.equal(requests,1)
})

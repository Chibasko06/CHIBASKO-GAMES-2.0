import test from 'node:test'
import assert from 'node:assert/strict'
import {developerDraftRequest,draftMetadata} from '../lib/server/developerDrafts.ts'
import {DraftAutosave} from '../lib/game-distribution/draft-autosave.ts'
import {emptyDraftMetadata} from '../lib/game-distribution/submission-drafts.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
import {uploadBuild} from '../lib/game-distribution/browser-upload.ts'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const initial={metadata:{...emptyDraftMetadata,title:'Initial'},version:'',revision:0}
const request=(body)=>new Request('https://site.example/api/developer/drafts'+(body?'':'?gameId='+id),body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})
test('draft API derives actor from verified authentication; private no-store and stable IDOR refusal',async()=>{
 const calls=[],deps={authenticate:async()=>id,db:()=>({call:async(name,args)=>{calls.push({name,args});return initial}})}
 const response=await developerDraftRequest(request(),deps)
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/)
 assert.equal(calls[0].args.p_actor,id);assert.equal(calls[0].args.p_game,id)
 const forbidden={...deps,db:()=>({call:async()=>{throw new UploadError('draft_not_found',404)}})}
 assert.equal((await developerDraftRequest(request(),forbidden)).status,404)
 assert.equal((await developerDraftRequest(request(),{...deps,authenticate:async()=>{throw new UploadError('unauthorized',401)}})).status,401)
 const logs=[]
 const failed=await developerDraftRequest(request(),{...deps,db:()=>({call:async()=>{throw Error('fixture secret credential')}}),log:entry=>logs.push(entry)})
 assert.equal(failed.status,503);assert.doesNotMatch(JSON.stringify(logs)+await failed.text(),/fixture secret|credential|staging_key|service_role/)
})
test('drafts allow incomplete metadata but reject website, injected identity, unknown keys and unsafe upload receipts',async()=>{
 let calls=0;const deps={authenticate:async()=>id,db:()=>({call:async()=>{calls++;return initial}})}
 const body={action:'save',gameId:id,revision:0,metadata:initial.metadata,version:'0.'}
 assert.equal((await developerDraftRequest(request(body),deps)).status,200)
 for(const extra of [{userId:id},{metadata:{...initial.metadata,website:'https://example.test'}},{metadata:{...initial.metadata,mobile:'yes'}},{metadata:{...initial.metadata,releaseDate:'2026-02-30'}}])assert.equal((await developerDraftRequest(request({...body,...extra}),deps)).status,400)
 assert.deepEqual(draftMetadata(emptyDraftMetadata),emptyDraftMetadata)
 const receipt={action:'upload-state',gameId:id,requestId:id,file:{name:'build.zip',size:123,lastModified:1},hashes:{1:'a'.repeat(64)}}
 assert.equal((await developerDraftRequest(request(receipt),deps)).status,200)
 assert.equal((await developerDraftRequest(request({...receipt,file:{...receipt.file,staging_key:'private'}}),deps)).status,400)
 assert.equal((await developerDraftRequest(request({...receipt,hashes:{1:'invalid'}}),deps)).status,400)
 assert.equal(calls,2)
})
test('autosave debounces, serializes in-flight edits and preserves optimistic revision',async t=>{
 t.mock.timers.enable({apis:['setTimeout']})
 const writes=[];let finish
 const save=new DraftAutosave(initial,(payload,revision)=>{writes.push({payload,revision});return writes.length===1?new Promise(resolve=>{finish=resolve}):Promise.resolve({...initial,revision:2})})
 save.update({metadata:{...initial.metadata,title:'A'},version:''})
 save.update({metadata:{...initial.metadata,title:'B'},version:'0.3.0'})
 t.mock.timers.tick(999);assert.equal(writes.length,0)
 t.mock.timers.tick(1);assert.equal(writes.length,1);assert.equal(writes[0].payload.metadata.title,'B')
 save.update({metadata:{...initial.metadata,title:'C'},version:'0.3.0'})
 finish({...initial,revision:1});await save.flush()
 assert.equal(writes.length,2);assert.equal(writes[1].revision,1);assert.equal(save.snapshot().status,'saved')
 save.dispose()
})
test('autosave errors never claim saved, retries same revision and supports strict-mode lifecycle',async()=>{
 let fail=true;const revisions=[]
 const save=new DraftAutosave(initial,async(payload,revision)=>{revisions.push(revision);if(fail)throw new UploadError('draft_conflict',409);return {...initial,revision:1}})
 save.dispose();save.activate();save.update({metadata:{...initial.metadata,title:'Changed'},version:''})
 await assert.rejects(save.flush());assert.equal(save.snapshot().status,'error');assert.equal(save.dirty,true)
 fail=false;await save.flush();assert.deepEqual(revisions,[0,0]);assert.equal(save.dirty,false);save.dispose()
})
test('multipart resume accepts copied ZIP with changed timestamp and awaits durable receipts before finalizing',async()=>{
 const file=new File(['fixture bytes'],'build.zip',{lastModified:200})
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await file.arrayBuffer())).toString('hex')
 const draft={requestId:id,gameId:id,version:'0.3.0',name:file.name,size:file.size,lastModified:100,uploadId:id,hashes:{1:hash}}
 let saved=false,finalized=false
 const api=async(path,init)=>{
  if(path.endsWith('/parts'))return {data:{parts:[{number:1,size:file.size}]}}
  if(path.endsWith('/finalize')){assert.equal(saved,true);finalized=true;return {data:{}}}
  assert.equal(init.signal.aborted,false);return {data:{id,status:'uploading',upload:{partSize:33554432}}}
 }
 await uploadBuild(file,draft,new AbortController().signal,{api,save:async()=>{await Promise.resolve();saved=true},put:()=>assert.fail('Matching part must not be resent'),progress:()=>{}})
 assert.equal(finalized,true)
 finalized=false
 await assert.rejects(uploadBuild(file,draft,new AbortController().signal,{api,save:async()=>{throw Error('offline')},put:()=>assert.fail(),progress:()=>{}}))
 assert.equal(finalized,false)
})

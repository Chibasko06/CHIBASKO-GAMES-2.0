import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readdir,readFile,mkdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {CloudflarePullQueue} from '../services/build-validator/queue.ts'
import {validatorLoop} from '../services/build-validator/runtime.ts'
import {processUpload,isolatedExtract} from '../services/build-validator/job.ts'
import {prepareScratch,heartbeat} from '../services/build-validator/scratch.ts'
import {UPLOAD_POLICY} from '../lib/game-distribution/uploads/policy.ts'
import {extractBuild} from '../services/build-validator/extract.ts'

test('consumer ACK follows completion or duplicate, RETRY follows failure or malformed message',async()=>{
  for(const mode of ['success','duplicate','failure','malformed']) {
    const controller=new AbortController(),events=[],logs=[],id=randomUUID()
    const queue={async pull(){return [{lease_id:'lease-fixture',body:mode==='malformed'?'invalid-private-fixture':JSON.stringify({type:'validate_game_build',uploadId:id})}]},
      async acknowledge(lease,retry){events.push(retry?'retry':'ack');controller.abort()}}
    await validatorLoop({queue,async process(value){assert.equal(value,id);events.push('process');if(mode==='failure')throw new Error('secret-fixture');},async cleanup(){},log:e=>logs.push(e)},controller.signal,1)
    assert.equal(events.at(-1),['success','duplicate'].includes(mode)?'ack':'retry')
    assert.doesNotMatch(logs.join(' '),/secret-fixture|invalid-private-fixture/)
  }
})
test('stop during processing retries the message, runs no cleanup or new pull and exposes no exception',async()=>{
  const stop=new AbortController(),events=[],logs=[];let pulls=0
  await validatorLoop({queue:{async pull(){pulls++;return [{lease_id:'l',body:{type:'validate_game_build',uploadId:randomUUID()}}]},
    async acknowledge(_,retry){events.push(retry?'retry':'ack')}},async process(_,signal){stop.abort();signal.throwIfAborted()},
    async cleanup(){assert.fail('cleanup during shutdown')},log:e=>logs.push(e)},stop.signal,1)
  assert.equal(pulls,1);assert.deepEqual(events,['retry']);assert.deepEqual(logs,['build_validator_interrupted'])
})
test('HTTP pull validates envelopes, masks errors and sends correct ack/retry bodies',async()=>{
  const calls=[],queue=new CloudflarePullQueue('a'.repeat(32),'b'.repeat(32),'fixture-token',async(url,init)=>{
    calls.push({url,body:JSON.parse(init.body),auth:init.headers.Authorization})
    return Response.json({success:true,result:{messages:[]}})
  })
  await queue.pull();await queue.acknowledge('lease');await queue.acknowledge('lease',true)
  assert.equal(calls[0].auth,'Bearer fixture-token');assert.equal(calls[0].body.batch_size,1)
  assert.deepEqual(calls[1].body,{acks:[{lease_id:'lease'}],retries:[]})
  assert.deepEqual(calls[2].body,{acks:[],retries:[{lease_id:'lease',delay_seconds:60}]})
  for(const value of [{success:false,errors:['fixture-token']},{success:true,result:null},{success:true,result:{messages:[{body:'x'}]}}]) {
    const q=new CloudflarePullQueue('a'.repeat(32),'b'.repeat(32),'fixture-token',async()=>Response.json(value))
    await assert.rejects(q.pull(),e=>e.message==='queue_error')
  }
  const q=new CloudflarePullQueue('a'.repeat(32),'b'.repeat(32),'fixture-token',async()=>{throw new Error('fixture-token')})
  await assert.rejects(q.pull(),e=>e.message==='queue_error')
})
test('scratch crash recovery is scoped and health contains only timestamp/state',async()=>{
  const root=await mkdtemp(join(tmpdir(),'validator-test-'))
  try{
    await mkdir(join(root,'chibasko-build-stale'));await writeFile(join(root,'chibasko-build-stale','file'),'fixture')
    await writeFile(join(root,'keep'),'fixture');await prepareScratch(root)
    assert.deepEqual(await readdir(root),['keep']);await heartbeat(root)
    assert.deepEqual(Object.keys(JSON.parse(await readFile(join(root,'health.json'),'utf8'))).sort(),['stopping','updatedAt'])
  }finally{await rm(root,{recursive:true,force:true})}
})
test('oversize download and shutdown clean scratch and never write final artifacts',async()=>{
  for(const mode of ['oversize','shutdown','wrong-key','duplicate']) {
    const root=await mkdtemp(join(tmpdir(),'validator-test-')),id=randomUUID(),stop=new AbortController(),calls=[]
    const upload={id,staging_key:`staging/uploads/${id}/source.zip`,staging_etag:'etag',expected_size:1,lease_token:'lease',
      policy:{...UPLOAD_POLICY,maxTotalBytes:1024,maxArchiveBytes:1}}
    if(mode==='wrong-key')upload.staging_key='staging/other/source.zip'
    const db={async call(name,args){calls.push([name,args]);return name==='distribution_claim'?(mode==='duplicate'?null:upload):undefined}}
    const staging={async read(){
      assert.ok(!['wrong-key','duplicate'].includes(mode))
      if(mode==='shutdown')return new ReadableStream({start(c){stop.signal.addEventListener('abort',()=>c.error(new Error('fixture-secret')),{once:true});setTimeout(()=>stop.abort(),10)}})
      return new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.close()}})
    }}
    try{
      const job=processUpload(id,db,staging,{bucket(){assert.fail('no final write')}},async()=>assert.fail('no extraction'),{scratchRoot:root,signal:stop.signal})
      if(mode==='shutdown')await assert.rejects(job,/validator_stopping/);else await job
      assert.deepEqual(await readdir(root),[])
      if(mode==='duplicate')assert.equal(calls.length,1)
      else{const failed=calls.find(([name])=>name==='distribution_fail');assert.ok(failed);assert.equal(failed[1].p_retry,mode==='shutdown')}
    }finally{await rm(root,{recursive:true,force:true})}
  }
})
test('parser abort waits for child exit before scratch cleanup',async()=>{
  const root=await mkdtemp(join(tmpdir(),'validator-test-')),stop=new AbortController()
  try{
    const child=join(root,'hang.mjs');await writeFile(child,'setInterval(()=>{},1000)')
    const running=isolatedExtract(root,5000,stop.signal,child)
    setTimeout(()=>stop.abort(),100)
    await assert.rejects(running,/validation_timeout/)
  }finally{await rm(root,{recursive:true,force:true})}
})
test('invalid ZIP bytes and archive size quota are rejected before extraction',async()=>{
  const root=await mkdtemp(join(tmpdir(),'validator-test-'))
  try{
    const archive=join(root,'archive.zip');await writeFile(archive,new Uint8Array([1,2,3,4]))
    const target={gameId:randomUUID(),version:'1.0.0'}
    await assert.rejects(extractBuild(archive,root,target,{...UPLOAD_POLICY,maxArchiveBytes:3}),/ARCHIVE_SIZE_LIMIT/)
    await assert.rejects(extractBuild(archive,root,target,UPLOAD_POLICY))
    assert.deepEqual(await readdir(root),['archive.zip'])
  }finally{await rm(root,{recursive:true,force:true})}
})
test('real service handles SIGTERM/SIGINT events during a claimed download without logging secrets',async()=>{
  for(const event of ['SIGTERM','SIGINT']) {
    const root=await mkdtemp(join(tmpdir(),'validator-test-')),preload=join(root,'preload.mjs'),scratch=join(root,'scratch'),id=randomUUID()
    const main=new URL('../.distribution/validator/main.mjs',import.meta.url).href
    await writeFile(preload,`
      const id=${JSON.stringify(id)};let pulled=false;
      globalThis.fetch=async(input,init)=>{
        const url=typeof input==='string'?input:input.url??String(input);
        if(url.includes('/messages/pull')){if(pulled)return Response.json({success:true,result:{messages:[]}});pulled=true;return Response.json({success:true,result:{messages:[{lease_id:'fixture-lease',body:JSON.stringify({type:'validate_game_build',uploadId:id})}]}})}
        if(url.includes('/messages/ack')){const body=JSON.parse(init.body);if(body.acks.length)throw new Error('unexpected ack');console.log('fixture_retry_confirmed');return Response.json({success:true,result:{}})}
        if(url.includes('/rpc/distribution_claim'))return Response.json({id,staging_key:'staging/uploads/'+id+'/source.zip',staging_etag:'etag',expected_size:1,lease_token:'lease',policy:{jobSeconds:3600,maxTotalBytes:1024,maxArchiveBytes:1024}});
        if(url.includes('/rpc/distribution_fail'))return new Response(null,{status:204});
        if(url.includes('.r2.cloudflarestorage.com/'))return new Response(new ReadableStream({start(c){setTimeout(()=>{process.emit(${JSON.stringify(event)});c.error(new Error('fixture-private-credential'))},20)}}));
        throw new Error('fixture-private-credential');
      };
      await import(${JSON.stringify(main)});
    `)
    try{
      const child=spawn(process.execPath,[preload],{windowsHide:true,env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,
        SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'fixture-private-credential',
        GAME_BUILDS_R2_ACCOUNT_ID:'a'.repeat(32),GAME_BUILDS_R2_ACCESS_KEY_ID:'fixture-key',GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-private-credential',
        GAME_BUILDS_STAGING_BUCKET:'fixture-staging',GAME_BUILDS_ARTIFACTS_BUCKET:'fixture-artifacts',GAME_BUILDS_QUEUE_ID:'b'.repeat(32),GAME_BUILDS_QUEUE_TOKEN:'fixture-private-credential',GAME_BUILDS_SCRATCH_DIR:scratch},stdio:['ignore','pipe','pipe']})
      let output='';child.stdout.on('data',v=>output+=v);child.stderr.on('data',v=>output+=v)
      const timer=setTimeout(()=>child.kill('SIGKILL'),15000)
      const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});clearTimeout(timer)
      assert.equal(code,0,output);assert.match(output,/fixture_retry_confirmed/);assert.match(output,/build_validator_stopped/)
      assert.doesNotMatch(output,/fixture-private-credential|fixture-key|fixture-lease/)
      assert.ok(!(await readdir(scratch)).some(name=>name.startsWith('chibasko-build-')))
    }finally{await rm(root,{recursive:true,force:true})}
  }
})

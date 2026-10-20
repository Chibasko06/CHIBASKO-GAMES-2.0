import test from 'node:test'
import assert from 'node:assert/strict'
import {uploadRepository} from '../lib/game-distribution/uploads/repository.ts'
import {developerSubmissionRequest} from '../lib/server/developerSubmissions.ts'

const base='https://fixture.supabase.co',credential='fixture-server-credential',actor='fixture-actor'
test('catalogue uses service credential and correct REST URL; permission failure is correlated and private',async()=>{
  const logs=[]
  const response=await developerSubmissionRequest(new Request('https://portal.example/api/developer/games?offset=0'),'games',{
    authenticate:async()=>actor,enabled:()=>true,
    db:requestId=>uploadRepository(base+'/rest/v1/',credential,async(url,init)=>{
      assert.equal(url.href,base+'/rest/v1/rpc/distribution_managed_catalog')
      assert.equal(init.headers.Authorization,'Bearer '+credential)
      assert.equal(init.cache,'no-store')
      assert.deepEqual(JSON.parse(init.body),{p_actor:actor,p_offset:0})
      return Response.json({code:'42501',message:'permission denied for table users',details:credential,hint:actor},{status:403})
    },{requestId,log:e=>logs.push(e)})
  })
  assert.equal(response.status,503)
  assert.deepEqual(await response.json(),{error:{code:'database_error'}})
  assert.equal(logs.length,1)
  assert.equal(logs[0].requestId,response.headers.get('X-Request-Id'))
  assert.equal(logs[0].upstreamStatus,403)
  assert.equal(logs[0].upstreamCode,'42501')
  assert.deepEqual(logs[0].permissionDenied,{kind:'table',object:'users'})
  assert.doesNotMatch(JSON.stringify(logs),/fixture-server-credential|fixture-actor|Authorization|details|hint/)
})
test('transport, timeout and invalid JSON remain failures; no implicit mutation retry',async()=>{
  for(const kind of ['network_error','timeout','invalid_response']){
    const logs=[];let calls=0
    const original=AbortSignal.timeout
    if(kind==='timeout')AbortSignal.timeout=()=>AbortSignal.abort(new DOMException('fixture','TimeoutError'))
    try{
      const db=uploadRepository(base,credential,async()=>{
        calls++
        if(kind==='invalid_response')return new Response('not JSON')
        throw new Error('transport '+credential)
      },{log:e=>logs.push(e)})
      await assert.rejects(db.call('distribution_register_game',{}),{code:'database_error',status:503})
      assert.equal(calls,1);assert.equal(logs[0].kind,kind)
      assert.ok(!JSON.stringify(logs).includes(credential))
    }finally{AbortSignal.timeout=original}
  }
})
test('business errors are preserved, logger failure cannot hide errors, and valid responses stay unchanged',async()=>{
  await assert.rejects(uploadRepository(base,credential,async()=>Response.json({message:'forbidden'},{status:400}),{log:()=>assert.fail()}).call('distribution_developer_catalog',{}),{code:'forbidden',status:403})
  await assert.rejects(uploadRepository(base,credential,async()=>Response.json({code:'42501',message:credential},{status:403}),{log:()=>{throw Error('logger')}}).call('distribution_developer_catalog',{}),{code:'database_error'})
  assert.deepEqual(await uploadRepository(base,credential,async()=>Response.json([{id:'fixture'}])).call('distribution_developer_catalog',{}),[{id:'fixture'}])
})

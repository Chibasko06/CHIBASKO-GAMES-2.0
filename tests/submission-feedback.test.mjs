import test from 'node:test'
import assert from 'node:assert/strict'
import {developerSubmissionRequest} from '../lib/server/developerSubmissions.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function request(){return new Request('https://fixture.example/api/developer/games',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id,Authorization:'Bearer fixture-private-token'},body:JSON.stringify({title:'Fixture private title'})})}
test('disabled upload flag reproduces exact 503 before any RPC and records a safe correlated reason',async()=>{
 const logs=[];let calls=0
 const response=await developerSubmissionRequest(request(),'games',{authenticate:async()=>id,enabled:()=>false,db:()=>({call:async()=>{calls++;assert.fail()}}),log:e=>logs.push(e)})
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'service_unavailable'}})
 assert.equal(calls,0);assert.equal(logs.length,1)
 assert.equal(logs[0].reason,'uploads_disabled');assert.equal(logs[0].phase,'upload_configuration')
 assert.equal(logs[0].operation,'register_game');assert.equal(logs[0].requestId,response.headers.get('X-Request-Id'))
 assert.doesNotMatch(JSON.stringify(logs),/fixture-private-token|Fixture private title|aaaaaaaa|authorization|service_role|Bearer/i)
})
test('enabled flag calls registration once, preserves RPC errors and cannot be broken by diagnostic sink',async()=>{
 let calls=0
 const deps={authenticate:async()=>id,enabled:()=>true,db:()=>({call:async(name,args)=>{calls++;assert.equal(name,'distribution_register_game');assert.equal(args.p_actor,id);return id}}),log:()=>{throw Error('fixture logger')}}
 const success=await developerSubmissionRequest(request(),'games',deps)
 assert.equal(success.status,201);assert.deepEqual(await success.json(),{data:{gameId:id}});assert.equal(calls,1)
 const logs=[]
 const failure=await developerSubmissionRequest(request(),'games',{...deps,db:()=>({call:async()=>{throw new UploadError('database_error',503)}}),log:e=>logs.push(e)})
 assert.equal(failure.status,503);assert.equal(logs[0].phase,'rpc');assert.equal(logs[0].code,'database_error')
 const loggerFailure=await developerSubmissionRequest(request(),'games',{...deps,db:()=>({call:async()=>{throw new Error('fixture private exception')}})})
 assert.equal(loggerFailure.status,503);assert.doesNotMatch(await loggerFailure.text(),/fixture private exception/)
})

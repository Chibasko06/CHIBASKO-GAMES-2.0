import {test} from 'node:test'
import assert from 'node:assert/strict'
import {reviewGame} from '../services/build-validator/review-job.ts'
import {reviewLabel} from '../lib/game-distribution/review.ts'
import {adminBuildRequest} from '../lib/server/adminBuilds.ts'
import {NextRequest} from './admin-next.mjs'
const id='12121212-1212-4212-8212-121212121212',actor='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
test('local review checks final persisted outcome, handles duplicates and refuses incompatible states',async()=>{
  for(const status of ['failed','validating','uploading','expired'])await assert.rejects(reviewGame(id,{call:async()=>({status})},async()=>assert.fail('must not process')),{code:'invalid_state'})
  const done={status:'completed',gameVersionId:id}
  assert.deepEqual(await reviewGame(id,{call:async()=>done},async()=>assert.fail('duplicate')),done)
  let state={status:'queued'},calls=0
  const db={call:async(name,args)=>{assert.equal(name,'distribution_review_job');assert.equal(args.p_id,id);return state}}
  assert.deepEqual(await reviewGame(id,db,async()=>{calls++;state=done}),done);assert.equal(calls,1)
  state={status:'queued'}
  await assert.rejects(reviewGame(id,db,async()=>{state={status:'failed'}}),{code:'validation_failed'})
  await assert.rejects(reviewGame('../private',{call:async()=>assert.fail()},async()=>assert.fail()))
})
test('developer statuses distinguish technical completion from publication',()=>{
  const base={decision:'pending',versionStatus:null,reason:null}
  for(const [technicalStatus,label] of [['created','Reçu'],['queued','En attente de vérification'],['validating','Vérification en cours'],['completed','Vérification technique réussie'],['failed','Refusé']])assert.equal(reviewLabel({...base,technicalStatus}),label)
  assert.equal(reviewLabel({...base,technicalStatus:'completed',versionStatus:'published'}),'Publié')
  assert.equal(reviewLabel({...base,technicalStatus:'completed',decision:'rejected'}),'Refusé')
})
test('admin endpoint authenticates before RPC, uses verified actor and exposes only safe projection',async t=>{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture-public';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only'
  globalThis.__phase0={admin:{}}
  let rpcCalls=0
  const bearer=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:actor,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture'
  let admin=false
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const url=new URL(String(input))
    if(url.pathname.endsWith('/user'))return Response.json({id:actor})
    if(url.pathname.endsWith('/admin_users'))return Response.json(admin?[{user_id:actor}]:[])
    rpcCalls++;assert.equal(JSON.parse(init.body).p_actor,actor)
    if(JSON.parse(init.body).p_id==='ffffffff-ffff-4fff-8fff-ffffffffffff')return Response.json({message:'upload_not_found'},{status:400})
    return Response.json({id,technicalStatus:'queued',versionStatus:null})
  })
  const req=(token)=>new NextRequest('https://site.example/api/admin/game-builds/'+id,{headers:token?{Authorization:'Bearer '+token}:{}})
  assert.equal((await adminBuildRequest(req())).status,401)
  assert.equal((await adminBuildRequest(req(bearer))).status,403);assert.equal(rpcCalls,0)
  admin=true
  const response=await adminBuildRequest(req(bearer),id);assert.equal(response.status,200)
  const body=await response.text();assert.match(body,/queued/);assert.doesNotMatch(body,/staging_key|service_role|token|fixture-only|storage_prefix/)
  assert.equal((await adminBuildRequest(req(bearer),'ffffffff-ffff-4fff-8fff-ffffffffffff')).status,404)
})

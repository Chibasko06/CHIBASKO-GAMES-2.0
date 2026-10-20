import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {build} from 'esbuild'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {REVIEW_ENV_FILE,REVIEW_REQUIRED_NAMES,loadReviewEnvironment,reviewEnvironmentReport,configureReviewEnvironment,configurationFailure} from '../scripts/review-environment.mjs'
import {reviewFailureMessage} from '../services/build-validator/review-diagnostics.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
import {R2RequestError} from '../lib/game-distribution/uploads/r2.ts'
import {processUpload} from '../services/build-validator/job.ts'
import {readdir} from 'node:fs/promises'
const fixture=()=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private-service',GAME_BUILDS_R2_ACCOUNT_ID:'a'.repeat(32),GAME_BUILDS_R2_ACCESS_KEY_ID:'fixture-private-access',GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-private-secret',GAME_BUILDS_STAGING_BUCKET:'fixture-staging',GAME_BUILDS_ARTIFACTS_BUCKET:'fixture-artifacts'})
test('missing environment fails before any remote call and prints names only',()=>{
 assert.deepEqual(reviewEnvironmentReport({}).missing,REVIEW_REQUIRED_NAMES)
 try{configureReviewEnvironment({});assert.fail()}catch(error){const message=configurationFailure(error);for(const name of REVIEW_REQUIRED_NAMES)assert.ok(message.includes(name));assert.match(message,/\.env.review.local/)}
})
test('dedicated local file is loaded, shell takes precedence, Next env is never implicitly read',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'chibasko-review-env-'))
 try{
  await writeFile(join(directory,'.env.local'),'SUPABASE_SERVICE_ROLE_KEY=fixture-private-next\n')
  const env={};assert.equal(await loadReviewEnvironment(directory,env),false);assert.deepEqual(env,{})
  await writeFile(join(directory,REVIEW_ENV_FILE),'SUPABASE_URL=https://fixture.supabase.co\nSUPABASE_SERVICE_ROLE_KEY="fixture-private-file"\n')
  env.SUPABASE_SERVICE_ROLE_KEY='fixture-private-shell'
  assert.equal(await loadReviewEnvironment(directory,env),true);assert.equal(env.SUPABASE_SERVICE_ROLE_KEY,'fixture-private-shell');assert.equal(env.SUPABASE_URL,'https://fixture.supabase.co')
 }finally{await rm(directory,{recursive:true,force:true})}
})
test('Supabase public URL alias is explicit fallback; canonical origin, distinct buckets and key formats are validated safely',()=>{
 const env=fixture();delete env.SUPABASE_URL;env.NEXT_PUBLIC_SUPABASE_URL='https://fixture.supabase.co'
 assert.equal(configureReviewEnvironment(env).missing.length,0);assert.equal(env.SUPABASE_URL,env.NEXT_PUBLIC_SUPABASE_URL)
 for(const change of [{SUPABASE_URL:'https://fixture.supabase.co/rest/v1/'},{SUPABASE_URL:'https://fixture-private-secret@fixture.supabase.co'},{GAME_BUILDS_R2_ACCOUNT_ID:'fixture-private-invalid'},{GAME_BUILDS_ARTIFACTS_BUCKET:'fixture-staging'},{SUPABASE_SERVICE_ROLE_KEY:'sb_publishable_fixture'},{GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-private-secret\n'}]){
  try{configureReviewEnvironment({...fixture(),...change});assert.fail()}catch(error){assert.equal(error.code,'review_invalid_environment');assert.doesNotMatch(configurationFailure(error),/fixture-private|https:/)}
 }
})
test('review errors distinguish RPC/state, R2, scratch and cleanup without raw exceptions',()=>{
 assert.match(reviewFailureMessage(new UploadError('invalid_state',409),'review_job'),/état actuel/)
 assert.match(reviewFailureMessage(new UploadError('database_error',503),'review_job'),/Supabase/)
 assert.equal(reviewFailureMessage(new R2RequestError({kind:'http_error',action:'object_read',upstreamStatus:403}),'review_job'),'review_storage_error: object_read / http_error / HTTP 403')
 for(const phase of ['scratch_setup','cleanup','review_job'])assert.doesNotMatch(reviewFailureMessage(Error('fixture-private-secret C:/private/path'),phase),/fixture-private|C:\//)
})
test('compiled local command rejects missing configuration without invoking a production RPC or claim',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'chibasko-review-command-'))
 try{
  const entry=join(directory,'review.mjs')
  await build({entryPoints:['services/build-validator/review.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outfile:entry,logLevel:'silent'})
  const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!name.startsWith('SUPABASE')&&!name.startsWith('NEXT_PUBLIC_SUPABASE')&&!name.startsWith('GAME_BUILDS')))
  await assert.rejects(promisify(execFile)(process.execPath,[entry,'12121212-1212-4212-8212-121212121212'],{env}),error=>{assert.equal(error.code,1);assert.match(error.stderr,/review_missing_environment/);assert.match(error.stderr,/GAME_BUILDS_STAGING_BUCKET/);assert.doesNotMatch(error.stderr,/distribution_rpc_failed|stack|fixture-private/);return true})
 }finally{await rm(directory,{recursive:true,force:true})}
})
test('job failure diagnostics preserve retry semantics, redact errors and clean temporary files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'chibasko-review-diagnostic-')),id='12121212-1212-4212-8212-121212121212'
 try{
  for(const mode of ['storage','disk']){
   const events=[],failures=[]
   const db={call:async(name,args)=>{
    if(name==='distribution_claim')return {id,staging_key:`staging/uploads/${id}/source.zip`,staging_etag:'fixture-etag',expected_size:1,lease_token:'fixture-private-lease',policy:{jobSeconds:60,maxTotalBytes:mode==='disk'?Number.MAX_SAFE_INTEGER:1}}
    assert.equal(name,'distribution_fail');failures.push(args)
   }}
   await processUpload(id,db,{read:async()=>{throw new R2RequestError({kind:'http_error',action:'object_read',upstreamStatus:403})}},{bucket:()=>assert.fail()},()=>assert.fail(),{scratchRoot:root,onFailure:entry=>events.push(entry)})
   assert.equal(failures.length,1);assert.equal(failures[0].p_retry,true)
   assert.equal(events[0].phase,mode==='disk'?'scratch':'download')
   if(mode==='disk')assert.equal(events[0].reason,'scratch_space_insufficient')
   else assert.deepEqual(events[0].r2,{kind:'http_error',action:'object_read',upstreamStatus:403})
   assert.doesNotMatch(JSON.stringify(events),/fixture-private|staging\/uploads|lease_token/)
   assert.deepEqual(await readdir(root),[])
  }
 }finally{await rm(root,{recursive:true,force:true})}
})

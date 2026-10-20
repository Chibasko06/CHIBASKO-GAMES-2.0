import test from 'node:test'
import assert from 'node:assert/strict'
import {NativeStagingR2} from '../lib/game-distribution/uploads/r2-native.ts'
import {DistributionR2} from '../lib/game-distribution/uploads/r2.ts'
import {uploadStagingStorage} from '../lib/server/uploadStagingStorage.ts'
const env={GAME_BUILDS_R2_ACCOUNT_ID:'a'.repeat(32),GAME_BUILDS_R2_ACCESS_KEY_ID:'fixture-access',GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-secret',GAME_BUILDS_STAGING_BUCKET:'fixture-staging'}
function fixture(){
 const calls=[];let object=null
 const bucket={createMultipartUpload:async key=>{calls.push(['create',key]);return {uploadId:'fixture-upload'}},resumeMultipartUpload:(key,id)=>({complete:async parts=>{calls.push(['complete',key,id,parts]);object={size:8,httpEtag:'"aabb-1"'}},abort:async()=>{calls.push(['abort',key,id])}}),head:async()=>object,delete:async key=>{calls.push(['delete',key]);object=null}}
 return {bucket,calls}
}
test('binding creates/resumes/completes with native ETags; only signing and ListParts use S3',async()=>{
 const {bucket,calls}=fixture(),key='staging/uploads/fixture/source.zip'
 const storage=new NativeStagingR2(bucket,{parts:async(k,id)=>{assert.equal(k,key);assert.equal(id,'fixture-upload');return [{number:1,size:8,etag:'"aabb"'}]},signPart:async(...args)=>{assert.deepEqual(args,[key,'fixture-upload',1,8,900]);return 'https://fixture.invalid/signed'}})
 assert.equal(await storage.begin(key),'fixture-upload');assert.equal(await storage.head(key),null)
 assert.equal(await storage.signPart(key,'fixture-upload',1,8,900),'https://fixture.invalid/signed')
 await storage.complete(key,'fixture-upload',await storage.parts(key,'fixture-upload'))
 assert.deepEqual(calls[1],['complete',key,'fixture-upload',[{partNumber:1,etag:'aabb'}]])
 assert.deepEqual(await storage.head(key),{size:8,etag:'"aabb-1"'})
 await storage.abort(key,'unused-upload');await storage.delete(key);assert.equal(await storage.head(key),null)
})
test('binding errors cannot expose raw exception, key or credentials; malformed results fail closed',async()=>{
 const {bucket}=fixture(),s3={parts:()=>assert.fail(),signPart:()=>assert.fail()}
 bucket.createMultipartUpload=async()=>{throw Error('fixture-secret private/key')}
 await assert.rejects(new NativeStagingR2(bucket,s3).begin('private/key'),error=>{assert.deepEqual(error.diagnostic,{kind:'binding_error',action:'multipart_create'});assert.doesNotMatch(JSON.stringify(error),/fixture-secret|private\/key/);return true})
 bucket.createMultipartUpload=async()=>({uploadId:''})
 await assert.rejects(new NativeStagingR2(bucket,s3).begin('key'),error=>error.diagnostic.kind==='invalid_response')
})
test('Worker requires binding, Node preserves S3 adapter; credentials remain required for direct upload signing',()=>{
 const unavailable=()=>{throw Error('No Worker context')}
 assert.ok(uploadStagingStorage(env,unavailable) instanceof DistributionR2)
 assert.ok(uploadStagingStorage(env,()=>({env:{GAME_BUILDS_STAGING:fixture().bucket}})) instanceof NativeStagingR2)
 assert.throws(()=>uploadStagingStorage({...env,CHIBASKO_CLOUDFLARE:'1'},unavailable),error=>error.configuration.missing.includes('GAME_BUILDS_STAGING'))
 assert.throws(()=>uploadStagingStorage({},()=>({env:{GAME_BUILDS_STAGING:fixture().bucket}})),error=>error.configuration.missing.includes('GAME_BUILDS_R2_SECRET_ACCESS_KEY'))
})
test('S3 uses manual redirects, refuses redirect responses and never follows credential-bearing requests',async()=>{
 let calls=0
 const storage=new DistributionR2({accountId:env.GAME_BUILDS_R2_ACCOUNT_ID,accessKeyId:'fixture-access',secretAccessKey:'fixture-secret',bucket:'fixture-staging'},async(request,init)=>{calls++;assert.equal(init.redirect,'manual');return new Response('',{status:307,headers:{Location:'https://untrusted.invalid'}})})
 await assert.rejects(storage.parts('private/key','fixture-upload'),error=>error.diagnostic.upstreamStatus===307)
 assert.equal(calls,1)
})

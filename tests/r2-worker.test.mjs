import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'

test('workerd reproduces unsupported redirect mode; native multipart interoperates with S3 signing/listing',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import {DistributionR2} from './lib/game-distribution/uploads/r2';
 import {NativeStagingR2} from './lib/game-distribution/uploads/r2-native';
 export default {async fetch(request,env){
  if(new URL(request.url).pathname==='/old-redirect'){
   try{await fetch('https://fixture.invalid/',{redirect:'error'});return new Response('unexpected success')}
   catch(error){return new Response(error.message)}
  }
  let stage='initial';try{
  const key='staging/uploads/fixture/source.zip';let part;let requests=0;
  const s3=new DistributionR2({accountId:'a'.repeat(32),accessKeyId:'fixture-access',secretAccessKey:'fixture-secret',bucket:'fixture-staging'},async(input,init)=>{
   requests++;if(init.redirect!=='manual')throw Error('Unsupported redirect mode');
   if(input.method!=='GET')throw Error('Native control operation used S3');
   return new Response('<ListPartsResult><Part><PartNumber>1</PartNumber><Size>8</Size><ETag>"'+part.etag+'"</ETag></Part><IsTruncated>false</IsTruncated></ListPartsResult>');
  });
  const storage=new NativeStagingR2(env.STAGING,s3);
  stage='create';const id=await storage.begin(key);
  stage='sign';const url=new URL(await storage.signPart(key,id,1,8,900));
  if(url.searchParams.get('uploadId')!==id||!url.searchParams.has('X-Amz-Signature'))throw Error('Invalid signature');
  stage='upload';part=await env.STAGING.resumeMultipartUpload(key,id).uploadPart(1,'abcdefgh');
  stage='list';const parts=await storage.parts(key,id);stage='complete';await storage.complete(key,id,parts);
  stage='head';const head=await storage.head(key),bytes=await (await env.STAGING.get(key)).text();
  await storage.delete(key);
  const unused=await storage.begin(key);await storage.abort(key,unused);
  return Response.json({size:head.size,quoted:head.etag.startsWith('"'),bytes,requests,deleted:await storage.head(key)===null});
 }catch(error){return Response.json({stage,diagnostic:error.diagnostic,message:error.message},{status:500})}
 }};`},bundle:true,write:false,format:'esm',platform:'browser'})
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-07',r2Buckets:['STAGING'],script:bundle.outputFiles[0].text,outboundService:()=>{assert.fail('No external request permitted')}}))
 try{
  const old=await mf.dispatchFetch('http://localhost/old-redirect')
  assert.match(await old.text(),/Invalid redirect value/)
  const result=await mf.dispatchFetch('http://localhost/')
  assert.equal(result.status,200,result.status===200?undefined:await result.text())
  assert.deepEqual(await result.json(),{size:8,quoted:true,bytes:'abcdefgh',requests:1,deleted:true})
 }finally{await mf.dispose()}
})

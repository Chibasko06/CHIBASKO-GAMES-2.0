import {test} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'

test('le nettoyage natif R2 reste limité à ses préfixes et reprend un multipart annulé',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import {accountCleanup} from './lib/game-distribution/account-cleanup';
 export default {async fetch(request,env){
  const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const key='staging/uploads/'+id+'/source.zip',upload=await env.STAGING.createMultipartUpload(key);
  await upload.abort();
  const clean=accountCleanup({call:async()=>false},{GAME_BUILDS_STAGING:env.STAGING,GAME_BUILDS_ARTIFACTS:env.ARTIFACTS});
  let multipart=false;
  try{await clean({id,kind:'staging',key,multipart:upload.uploadId,lease:id});multipart=true}
  catch(error){return Response.json({phase:'abort',name:error.name,message:error.message},{status:500})}
  await env.ARTIFACTS.put('games/'+id+'/versions/private/file','private');
  await env.ARTIFACTS.put('games/'+other+'/versions/published/file','published');
  await clean({id,kind:'artifacts',key:'games/'+id+'/',lease:id});
  return Response.json({multipart,privateRemoved:await env.ARTIFACTS.head('games/'+id+'/versions/private/file')===null,
   publishedKept:await (await env.ARTIFACTS.get('games/'+other+'/versions/published/file')).text()==='published'});
 }};`},bundle:true,write:false,format:'esm',platform:'browser'})
 const runtime=new Miniflare(convertV4MiniflareOptions({modules:true,compatibilityDate:'2026-10-18',r2Buckets:['STAGING','ARTIFACTS'],script:bundle.outputFiles[0].text,outboundService:()=>assert.fail('Aucun appel distant autorisé')}))
 try{
  const response=await runtime.dispatchFetch('http://localhost/')
  assert.equal(response.status,200,await response.clone().text())
  assert.deepEqual(await response.json(),{multipart:true,privateRemoved:true,publishedKept:true})
 }finally{await runtime.dispose()}
})

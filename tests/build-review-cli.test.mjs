import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,readdir,rm,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawn} from 'node:child_process'
import {build} from 'esbuild'
import {ZipWriter,Uint8ArrayWriter,Uint8ArrayReader} from '@zip.js/zip.js'

test('compiled local review uses real parser/R2 adapter, final DB state and cleans temporary files',async()=>{
  await build({entryPoints:['services/build-validator/review.ts','services/build-validator/child.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outdir:'.distribution/review',outExtension:{'.js':'.mjs'},logLevel:'silent'})
  const fixture=new URL('./fixtures/game-builds/solo/',import.meta.url),manifest=JSON.parse(await readFile(new URL('chibasko.json',fixture),'utf8'))
  const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false})
  await writer.add('chibasko.json',new Uint8ArrayReader(new TextEncoder().encode(JSON.stringify(manifest))))
  await writer.add(manifest.client.entrypoints.local,new Uint8ArrayReader(new TextEncoder().encode('<!doctype html><title>Fixture</title>')))
  const valid=await writer.close(),id='12121212-1212-4212-8212-121212121212'
  for(const mode of ['valid','invalid','duplicate']) {
    const root=await mkdtemp(join(tmpdir(),'review-test-')),scratch=join(root,'scratch'),preload=join(root,'preload.mjs');await mkdir(scratch)
    const bytes=mode==='invalid'?new Uint8Array([1,2,3]):valid
    await writeFile(preload,`
      import assert from 'node:assert/strict';
      const id=${JSON.stringify(id)},manifest=${JSON.stringify(manifest)},bytes=Buffer.from(${JSON.stringify(Buffer.from(bytes).toString('base64'))},'base64');
      let state=${JSON.stringify(mode==='duplicate'?'completed':'queued')},puts=0;
      globalThis.fetch=async(input,init)=>{
        const url=new URL(typeof input==='string'?input:input.url??String(input));
        if(url.hostname==='fixture.supabase.co'){
          const body=JSON.parse(init.body);assert.equal(body.p_id,id);
          switch(url.pathname.split('/').at(-1)){
            case 'distribution_review_job':return Response.json({status:state,gameVersionId:state==='completed'?id:null});
            case 'distribution_claim':assert.equal(state,'queued');state='validating';return Response.json({id,game_id:manifest.gameId,version:manifest.version,version_id:id,
              staging_key:'staging/uploads/'+id+'/source.zip',staging_etag:'fixture-etag',expected_size:bytes.length,lease_token:'fixture-lease',
              policy:{revision:1,jobSeconds:120,maxArchiveBytes:1048576,maxTotalBytes:1048576,maxFileBytes:1048576,maxFiles:100,maxManifestBytes:65536,maxCompressionRatio:200,maxPathDepth:32,validationMs:30000}});
            case 'distribution_checkpoint':assert.equal(body.p_checkpoint.manifest.gameId,manifest.gameId);return new Response(null,{status:204});
            case 'distribution_complete':assert.ok(puts>=4);state='completed';return Response.json({status:state});
            case 'distribution_fail':state='failed';return new Response(null,{status:204});
          }
        }
        if(url.hostname.endsWith('.r2.cloudflarestorage.com')){
          if(input.method==='GET'){assert.equal(url.pathname,'/fixture-staging/staging/uploads/'+id+'/source.zip');return new Response(bytes)}
          assert.ok(url.pathname.startsWith('/fixture-artifacts/games/'+manifest.gameId+'/versions/'+id+'/'));
          if(input.method==='HEAD')return new Response(null,{status:404});
          if(input.method==='PUT'){assert.equal(input.headers.get('if-none-match'),'*');await input.arrayBuffer();puts++;return new Response(null,{status:200})}
        }
        throw new Error('unexpected_fixture_request');
      };
    `)
    try {
      const child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'.distribution/review/review.mjs',id],{windowsHide:true,env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,
        SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-only',GAME_BUILDS_R2_ACCOUNT_ID:'a'.repeat(32),GAME_BUILDS_R2_ACCESS_KEY_ID:'fixture-only',GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-only',
        GAME_BUILDS_STAGING_BUCKET:'fixture-staging',GAME_BUILDS_ARTIFACTS_BUCKET:'fixture-artifacts',GAME_BUILDS_SCRATCH_DIR:scratch},stdio:['ignore','pipe','pipe']})
      let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b)
      const timer=setTimeout(()=>child.kill('SIGKILL'),45000)
      const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});clearTimeout(timer)
      assert.equal(code,mode==='invalid'?1:0,output)
      assert.match(output,mode==='invalid'?/review_failed/:/"status":"completed"/)
      assert.doesNotMatch(output,/fixture-only|fixture-lease|staging\/uploads|service_role|secret_access/i)
      assert.deepEqual(await readdir(scratch),[])
    }finally{await rm(root,{recursive:true,force:true})}
  }
})

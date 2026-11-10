import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {ZipWriter,Uint8ArrayWriter,Uint8ArrayReader} from '@zip.js/zip.js'
import {isolatedExtract,processUpload} from '../services/build-validator/job.ts'
import {UPLOAD_POLICY} from '../lib/game-distribution/uploads/policy.ts'
import {extractionDiagnostic} from '../services/build-validator/extraction-diagnostics.ts'
import {parseValidationEvent,validationEvent} from '../lib/game-distribution/validation-diagnostics.ts'
import {uploadRepository} from '../lib/game-distribution/uploads/repository.ts'
import {publicUpload} from '../lib/game-distribution/uploads/contracts.ts'

const encoder=new TextEncoder(),child=resolve('.distribution/validator/child.mjs')
const manifest=JSON.parse(await readFile(new URL('./fixtures/game-builds/solo/chibasko.json',import.meta.url),'utf8'))
const target={gameId:manifest.gameId,version:manifest.version},entry=Object.values(manifest.client.entrypoints)[0]
const defaults=[['chibasko.json',JSON.stringify(manifest)],[entry,'<!doctype html><title>Jeu fixture</title>']]
async function zip(files){const writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false});for(const [path,text]of files)await writer.add(path,new Uint8ArrayReader(encoder.encode(text)));return writer.close()}
async function scratch(t){const directory=await mkdtemp(join(tmpdir(),'chibasko-extract-diagnostic-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory}
async function run(t,files=defaults,policy={}){
  const directory=await scratch(t);await writeFile(join(directory,'archive.zip'),await zip(files));await writeFile(join(directory,'request.json'),JSON.stringify({target,policy:{...UPLOAD_POLICY,...policy}}));return directory
}
test('le vrai parseur isolé accepte une archive valide sans exécuter son HTML',async t=>{
  const directory=await run(t);await isolatedExtract(directory,10000,AbortSignal.timeout(15000),child)
  const result=JSON.parse(await readFile(join(directory,'result.json'),'utf8'));assert.equal(result.checkpoint.manifest.gameId,target.gameId)
})

test('le contrôle local sans identité de dépôt applique les mêmes règles et hashes sans conserver les assets',async t=>{
 const files=[...defaults,['assets/texture.bin','asset fixture']],directory=await run(t,files)
 await isolatedExtract(directory,10000,AbortSignal.timeout(15000),child)
 const full=JSON.parse(await readFile(join(directory,'result.json'),'utf8')),local=await run(t,files)
 await writeFile(join(local,'archive.zip'),await readFile(join(directory,'archive.zip')))
 await writeFile(join(local,'request.json'),JSON.stringify({target:null,policy:UPLOAD_POLICY,spoolAssets:false}))
 await isolatedExtract(local,10000,AbortSignal.timeout(15000),child)
 const checked=JSON.parse(await readFile(join(local,'result.json'),'utf8'))
 assert.deepEqual(checked.checkpoint,full.checkpoint)
 assert.equal(checked.spools.length,2);assert.equal(full.spools.length,3)
 await assert.rejects(readFile(join(local,'2.bin')),e=>e.code==='ENOENT')
})
test('les contrôles réels remontent leur motif, fichier ou champ sans relâcher les limites',async t=>{
  const invalid={...manifest};delete invalid.gameId
  const cases=[
    ['manifeste absent',[[entry,'jeu']],{},'ROOT_MANIFEST_REQUIRED'],
    ['JSON incorrect',[['chibasko.json','{invalid'],defaults[1]],{},'INVALID_MANIFEST_JSON','chibasko.json'],
    ['champ manquant',[['chibasko.json',JSON.stringify(invalid)],defaults[1]],{},'INVALID_MANIFEST_SCHEMA','chibasko.json','/gameId'],
    ['entrée absente',[defaults[0]],{},'ENTRYPOINT_MISSING',entry],
    ['traversée',[...defaults,['../escape.js','x']],{},'UNSAFE_ARTIFACT_PATH'],
    ['configuration hébergeur',[...defaults,['_headers','/*']],{},'FORBIDDEN_ARTIFACT_FILE','_headers'],
    ['autre configuration',[...defaults,['_redirects','/* /index.html 200']],{},'FORBIDDEN_ARTIFACT_FILE','_redirects'],
    ['fichier caché',[...defaults,['.env','x']],{},'UNSAFE_ARTIFACT_PATH','.env'],
    ['doublon de casse',[...defaults,['x.txt','x'],['X.txt','y']],{},'DUPLICATE_BUILD_PATH','X.txt'],
    ['nombre de fichiers',[...defaults,['x.txt','x']],{maxFiles:2},'BUILD_FILE_LIMIT'],
    ['taille fichier',defaults,{maxFileBytes:1},'BUILD_FILE_SIZE','chibasko.json'],
    ['ratio',[...defaults,['bomb.bin','x'.repeat(10000)]],{maxCompressionRatio:2},'ARCHIVE_RATIO_LIMIT','bomb.bin'],
  ]
  for(const [name,files,policy,reason,path,field]of cases)await t.test(name,async t=>{
    const directory=await run(t,files,policy)
    await assert.rejects(isolatedExtract(directory,10000,AbortSignal.timeout(15000),child),error=>{
      assert.equal(error.code,'validation_failed');assert.equal(error.diagnostic.kind,'submission');assert.equal(error.diagnostic.reason,reason)
      if(path)assert.equal(error.diagnostic.path,path);if(field)assert.equal(error.diagnostic.field,field);return true
    })
  })
})
test('une archive corrompue est distinguée d’un échec local de disque',async t=>{
  const directory=await scratch(t);await writeFile(join(directory,'request.json'),JSON.stringify({target,policy:UPLOAD_POLICY}));await writeFile(join(directory,'archive.zip'),'not a zip')
  await assert.rejects(isolatedExtract(directory,10000,AbortSignal.timeout(15000),child),error=>error.diagnostic.kind==='submission'&&error.diagnostic.reason==='ZIP_FORMAT_INVALID')
  await rm(join(directory,'archive.zip'))
  await rm(join(directory,'failure.json'))
  await assert.rejects(isolatedExtract(directory,10000,AbortSignal.timeout(15000),child),error=>error.diagnostic.kind==='internal'&&error.diagnostic.reason==='EXTRACTOR_IO_ERROR')
})
test('un enfant indisponible ou tué ne devient pas une accusation contre le ZIP',async t=>{
  const directory=await scratch(t)
  await assert.rejects(isolatedExtract(directory,1000,AbortSignal.timeout(2000),join(directory,'missing.mjs')),error=>error.diagnostic.kind==='internal'&&error.diagnostic.reason==='EXTRACTOR_EXITED')
  const slow=join(directory,'slow.mjs');await writeFile(slow,'setInterval(()=>{},1000)')
  await assert.rejects(isolatedExtract(directory,50,AbortSignal.timeout(2000),slow),error=>error.code==='validation_timeout'&&error.diagnostic.reason==='EXTRACTOR_TIMEOUT')
})
test('les exceptions et champs sensibles ne traversent pas le contrat de diagnostic',()=>{
  for(const code of ['ENOSPC','ENOENT','EACCES','ERR_ACCESS_DENIED']){
    const result=extractionDiagnostic(Object.assign(new Error('private-server-path secret-value'),{code,path:'/private/server/file'}));assert.equal(result.kind,'internal');assert.doesNotMatch(JSON.stringify(result),/private|secret/)
  }
  const action=validationEvent(1,{version:1,kind:'submission',reason:'INVALID_MANIFEST_SCHEMA',path:'/private/server/file',field:'/secret-value',message:'secret-value'})
  assert.doesNotMatch(action,/private|secret/);assert.equal(parseValidationEvent(action).diagnostic.reason,'INVALID_MANIFEST_SCHEMA')
  assert.equal(parseValidationEvent('validation_diagnostic:{"version":1,"reason":"secret-value"}'),null)
})
test('le diagnostic du job accompagne atomiquement l’échec durable, sans changer la décision ni les données publiques',async()=>{
  const id=randomUUID(),failures=[],calls=[],bytes=new Uint8Array([1,2,3])
  const upload={id,game_id:target.gameId,version:target.version,staging_key:`staging/uploads/${id}/source.zip`,staging_etag:'fixture',expected_size:bytes.length,policy:UPLOAD_POLICY,lease_token:randomUUID(),attempts:1}
  const db={call:async(name,args)=>{calls.push({name,args});return name==='distribution_claim'?upload:undefined}}
  await processUpload(id,db,{read:async()=>new Response(bytes).body},{},async()=>{throw Object.assign(new Error('private-server-path secret-value'),{code:'ENOSPC'})},{onFailure:value=>failures.push(value)})
  assert.equal(calls.at(-1).args.p_code,'validation_failed');assert.equal(calls.at(-1).args.p_diagnostic.kind,'internal');assert.doesNotMatch(JSON.stringify(failures),/private|secret/)
  assert.deepEqual(publicUpload({...upload,status:'failed',error_code:'validation_failed'}).error,{code:'validation_failed'})
})
test('le dépôt utilise uniquement le journal privé et n’inclut ni exception ni secret dans son contenu',async()=>{
  let request
  const db=uploadRepository('https://fixture.example','fixture-only',async(url,options)=>{request={url:String(url),...options};return Response.json(null)})
  await db.call('distribution_validation_fail',{p_id:randomUUID(),p_lease:randomUUID(),p_code:'validation_failed',p_retry:false,p_phase:'extract',p_diagnostic:{version:1,kind:'internal',reason:'EXTRACTOR_IO_ERROR'}})
  assert.equal(new URL(request.url).pathname,'/rest/v1/rpc/distribution_validation_fail');assert.equal(request.method,'POST')
  const body=JSON.parse(request.body);assert.equal(body.p_diagnostic.reason,'EXTRACTOR_IO_ERROR');assert.doesNotMatch(request.body,/fixture-only|secret|server/)
})

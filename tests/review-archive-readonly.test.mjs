import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm,readdir,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID,createHash} from 'node:crypto'
import {readOnlyArchiveStorage,downloadReviewArchive,inspectReviewArchive} from '../services/build-validator/read-only-archive.ts'
import {UPLOAD_POLICY} from '../lib/game-distribution/uploads/policy.ts'
import {ZipWriter,Uint8ArrayWriter,Uint8ArrayReader} from '@zip.js/zip.js'

const env={GAME_BUILDS_R2_ACCOUNT_ID:'a'.repeat(32),GAME_BUILDS_R2_ACCESS_KEY_ID:'fixture-access',GAME_BUILDS_R2_SECRET_ACCESS_KEY:'fixture-only',GAME_BUILDS_STAGING_BUCKET:'fixture-staging'}
const etag='"fixture-etag"',bytes=new Uint8Array([1,2,3])
async function directory(t){const root=await mkdtemp(join(tmpdir(),'chibasko-archive-readonly-'));t.after(()=>rm(root,{recursive:true,force:true}));return join(root,'copy')}
test('la récupération signe uniquement HEAD/GET sur la clé de staging de l’upload et conserve l’original',async t=>{
  const requests=[],id=randomUUID(),output=await directory(t)
  const storage=readOnlyArchiveStorage(env,async request=>{
    requests.push(request);assert.equal(new URL(request.url).pathname,`/fixture-staging/staging/uploads/${id}/source.zip`)
    if(request.method==='HEAD')return new Response(null,{headers:{'Content-Length':'3',ETag:etag}})
    assert.equal(request.headers.get('If-Match'),etag);return new Response(bytes)
  })
  assert.deepEqual(Object.keys(storage).sort(),['head','read'])
  const receipt=await downloadReviewArchive(storage,id,3,etag,output,AbortSignal.timeout(1000))
  assert.deepEqual(requests.map(request=>request.method),['HEAD','GET'])
  assert.deepEqual(new Uint8Array(await readFile(join(output,'archive.zip'))),bytes)
  assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'))
  await assert.rejects(downloadReviewArchive(storage,id,3,etag,output,AbortSignal.timeout(1000)))
  assert.deepEqual(new Uint8Array(await readFile(join(output,'archive.zip'))),bytes)
})
test('un ETag ou une taille différents interdisent le GET et n’écrivent aucun ZIP',async t=>{
  let reads=0
  for(const metadata of [{size:4,etag},{size:3,etag:'autre'}]){
    const storage={head:async()=>metadata,read:async()=>{reads++;throw Error('ne doit pas lire')}}
    await assert.rejects(downloadReviewArchive(storage,randomUUID(),3,etag,await directory(t),AbortSignal.timeout(1000)),/original_archive_metadata_mismatch/)
  }
  assert.equal(reads,0)
})
test('une lecture incomplète nettoie uniquement la copie partielle locale',async t=>{
  const output=await directory(t),storage={head:async()=>({size:3,etag}),read:async()=>new Response(new Uint8Array([1])).body}
  await assert.rejects(downloadReviewArchive(storage,randomUUID(),3,etag,output,AbortSignal.timeout(1000)),/original_archive_size_mismatch/)
  assert.deepEqual(await readdir(output),[])
})
test('une configuration incomplète ou un identifiant dangereux échoue avant toute lecture distante',async t=>{
  let calls=0;assert.throws(()=>readOnlyArchiveStorage({},async()=>{calls++;throw Error()}))
  await assert.rejects(downloadReviewArchive({head:async()=>{calls++;return null}},'../unsafe',3,etag,await directory(t),AbortSignal.timeout(1000)))
  assert.equal(calls,0)
})
test('l’inspection locale ne modifie pas le ZIP et n’exécute pas le HTML ou JavaScript',async t=>{
  const path=(await directory(t))+'.zip',manifest=JSON.parse(await readFile(new URL('./fixtures/game-builds/solo/chibasko.json',import.meta.url),'utf8'))
  const target={gameId:manifest.gameId,version:manifest.version},entry=Object.values(manifest.client.entrypoints)[0],writer=new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false}),encoder=new TextEncoder()
  await writer.add('chibasko.json',new Uint8ArrayReader(encoder.encode(JSON.stringify(manifest))))
  await writer.add(entry,new Uint8ArrayReader(encoder.encode('<script>throw Error("LE JEU NE DOIT PAS ETRE EXECUTE")</script>')))
  const original=await writer.close();await writeFile(path,original)
  const result=await inspectReviewArchive(path,target,{...UPLOAD_POLICY,maxTotalBytes:1024*1024},AbortSignal.timeout(10000),resolve('.distribution/validator/child.mjs'))
  assert.equal(result.status,'valid');assert.deepEqual(new Uint8Array(await readFile(path)),original)
  await assert.rejects(inspectReviewArchive(path,target,{...UPLOAD_POLICY,maxFiles:Infinity},AbortSignal.timeout(1000)),/invalid_inspection_policy/)
})

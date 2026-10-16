import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { build as bundle } from 'esbuild'
import { ZipWriter, Uint8ArrayWriter, Uint8ArrayReader } from '@zip.js/zip.js'
import { validateManifest } from '../lib/game-distribution/manifest.ts'
import { validateWebBuild, DEFAULT_BUILD_LIMITS } from '../lib/game-distribution/build.ts'
import { validateWebBuildZip } from '../lib/game-distribution/zip.ts'
import { gameArtifactKeys } from '../lib/game-distribution/keys.ts'
import { artifactMedia, assertArtifactPath } from '../lib/game-distribution/paths.ts'
import { putArtifactFile } from '../lib/game-distribution/storage.ts'

const encoder = new TextEncoder()
async function fixture(name) {
  const base = new URL('./fixtures/game-builds/'+name+'/',import.meta.url), files = []
  async function walk(dir) { for (const entry of await readdir(new URL(dir,base),{withFileTypes:true})) {
    if (entry.isDirectory()) await walk(dir+entry.name+'/')
    else files.push({path:dir+entry.name,bytes:new Uint8Array(await readFile(new URL(dir+entry.name,base)))})
  } }
  await walk(''); return files
}
const pongFiles = await fixture('pong'), soloFiles = await fixture('solo')
const manifest = files => JSON.parse(new TextDecoder().decode(files.find(file=>file.path==='chibasko.json').bytes))
const pong = manifest(pongFiles), solo = manifest(soloFiles), target = m => ({gameId:m.gameId,version:m.version})
const clone = value => structuredClone(value)
async function zip(files, options = {}) {
  const writer = new ZipWriter(new Uint8ArrayWriter(),{useWebWorkers:false,...options})
  for (const file of files) await writer.add(file.path,new Uint8ArrayReader(file.bytes),options)
  return writer.close()
}

test('one schema handles Pong-shaped and unrelated local-only HTML builds, no game code/import required', async()=>{
  for (const [files,m] of [[pongFiles,pong],[soloFiles,solo]]) {
    const result = await validateWebBuild(files,target(m))
    assert.equal(result.manifest.gameId,m.gameId); assert.equal(result.artifactSha256.length,64)
    assert.ok(Object.isFrozen(result.manifest.client.entrypoints))
  }
  assert.equal(validateManifest(solo,target(solo)).capabilities.online,undefined)
  const soloArchive = await validateWebBuildZip(await zip(soloFiles),target(solo))
  assert.equal(soloArchive.manifest.client.entrypoints.local,'play/start.html')
  assert.equal(soloArchive.manifest.capabilities.online,undefined)
  const online = clone(pong);delete online.capabilities.local;delete online.client.entrypoints.local
  online.capabilities.online.players = {min:2,max:4};online.client.entrypoints.online='online/play.html'
  for (const access of [['public'],['private'],['public','private']]) { online.capabilities.online.access=access;assert.ok(validateManifest(online,target(online))) }
})
test('unknown schemas/integration, invalid SemVer, hidden fields and incoherent capabilities are refused',()=>{
  const changes = [m=>m.schemaVersion=2,m=>m.integrationVersion=99,m=>m.version='latest',m=>m.version='01.2.3',m=>m.version='1.0.0+alias',
    m=>m.hosting='external',m=>m.title='Catalogue',m=>m.client.serverUrl='https://example.com',m=>m.capabilities={},
    m=>m.capabilities.online.access=[],m=>m.capabilities.online.access=['public','public'],m=>m.capabilities.online.players.min=0,
    m=>m.capabilities.online.players.min=3,m=>m.capabilities.local.players.max=1.5,m=>delete m.client.entrypoints.local,
    m=>m.client.entrypoints.local='../outside.html',m=>m.client.entrypoints.local='https://example.com/play.html']
  for (const change of changes) { const m=clone(pong);change(m);assert.throws(()=>validateManifest(m,target(m))) }
  assert.throws(()=>validateManifest(pong,{...target(pong),gameId:solo.gameId}),/MISMATCH/)
  assert.throws(()=>validateManifest(pong,{...target(pong),version:'2.0.0'}),/MISMATCH/)
})
test('root manifest, real entrypoint, canonical paths, duplicate/colliding files and quotas are enforced',async()=>{
  await assert.rejects(validateWebBuild(pongFiles.filter(f=>f.path!=='chibasko.json'),target(pong)),/MANIFEST/)
  await assert.rejects(validateWebBuild(pongFiles.filter(f=>f.path!=='index.html'),target(pong)),/ENTRYPOINT/)
  await assert.rejects(validateWebBuild(pongFiles.map(f=>f.path==='index.html'?{...f,bytes:new Uint8Array([0xff])}:f),target(pong)),/UTF8/)
  for (const path of ['../evil.js','/index.html','a/../b.js','a\\b.js','https://evil/x.js','a%2fb.js','a//b.js','.env','a/CON.js','a./x.js','a/evil.php','_headers']) {
    assert.throws(()=>assertArtifactPath(path)); await assert.rejects(validateWebBuild([...pongFiles,{path,bytes:encoder.encode('x')}],target(pong)))
  }
  assert.doesNotThrow(()=>assertArtifactPath('assets/Mon image été.png'))
  for (const extra of [[{path:'INDEX.html',bytes:encoder.encode('x')}],[{path:'assets',bytes:encoder.encode('x')},{path:'assets/a.bin',bytes:encoder.encode('x')}]]) await assert.rejects(validateWebBuild([...pongFiles,...extra],target(pong)))
  await assert.rejects(validateWebBuild(pongFiles,target(pong),{...DEFAULT_BUILD_LIMITS,maxFiles:1}),/LIMIT/)
  await assert.rejects(validateWebBuild(pongFiles,target(pong),{...DEFAULT_BUILD_LIMITS,maxTotalBytes:2}),/SIZE/)
})
test('content hash is stable across enumeration and ZIP metadata; changing any byte changes identity',async()=>{
  const a=await validateWebBuild(pongFiles,target(pong)),b=await validateWebBuild([...pongFiles].reverse(),target(pong))
  assert.equal(a.artifactSha256,b.artifactSha256)
  const changed=await validateWebBuild([...pongFiles,{path:'assets/custom-engine.asset',bytes:encoder.encode('data')}],target(pong))
  assert.notEqual(a.artifactSha256,changed.artifactSha256)
  const zipped=await validateWebBuildZip(await zip(pongFiles),target(pong))
  assert.equal(zipped.artifactSha256,a.artifactSha256);assert.equal(zipped.archiveSha256.length,64)
  const z2=await validateWebBuildZip(await zip([...pongFiles].reverse(),{lastModDate:new Date('2020-01-01')}),target(pong))
  assert.equal(zipped.artifactSha256,z2.artifactSha256);assert.notEqual(zipped.archiveSha256,z2.archiveSha256)
})
test('real ZIP rejects traversal, symlinks, encrypted content, corrupt bytes, mismatched local headers and expansion bombs',async()=>{
  await assert.rejects(validateWebBuildZip(await zip([...pongFiles,{path:'../escape.js',bytes:encoder.encode('x')}]),target(pong)))
  await assert.rejects(validateWebBuildZip(await zip(pongFiles,{unixMode:0o120777}),target(pong)))
  await assert.rejects(validateWebBuildZip(await zip(pongFiles,{password:'fixture-only'}),target(pong)))
  const bytes=await zip(pongFiles,{level:0}), broken=bytes.slice();broken[0]=0
  await assert.rejects(validateWebBuildZip(broken,target(pong)))
  const mismatch=bytes.slice();mismatch[30]^=1
  await assert.rejects(validateWebBuildZip(mismatch,target(pong)))
  const corrupt=bytes.slice(), header=new DataView(corrupt.buffer);corrupt[30+header.getUint16(26,true)+header.getUint16(28,true)]^=1
  await assert.rejects(validateWebBuildZip(corrupt,target(pong)))
  const bomb=await zip([...pongFiles,{path:'assets/huge.bin',bytes:new Uint8Array(100_000)}])
  await assert.rejects(validateWebBuildZip(bomb,target(pong),{...DEFAULT_BUILD_LIMITS,maxCompressionRatio:10}),/RATIO/)
  await assert.rejects(validateWebBuildZip(bytes,target(pong),{...DEFAULT_BUILD_LIMITS,maxArchiveBytes:2}),/SIZE/)
  await assert.rejects(validateWebBuildZip(await zip(pongFiles),{...target(pong),gameId:solo.gameId}),/MISMATCH/)
})
test('immutable keys use game/version UUID and content digest; media supports generic/WASM/compressed engine assets',()=>{
  const keys=gameArtifactKeys(pong.gameId,'33333333-3333-4333-8333-333333333333','a'.repeat(64))
  assert.ok(keys.file('index.html').endsWith('/client/index.html'))
  assert.ok(keys.archive('b'.repeat(64)).endsWith('/archives/'+'b'.repeat(64)+'.zip'))
  assert.throws(()=>keys.file('../index.html'));assert.throws(()=>gameArtifactKeys(pong.gameId,'latest','a'.repeat(64)))
  assert.deepEqual(artifactMedia('Build/game.wasm.br'),{contentType:'application/wasm',contentEncoding:'br'})
  assert.deepEqual(artifactMedia('game.framework.js.gz'),{contentType:'text/javascript; charset=utf-8',contentEncoding:'gzip'})
  assert.equal(artifactMedia('assets/game.pck').contentType,'application/octet-stream')
})
test('artifact port writes only absent objects, verifies bytes again and never reuses the public image bucket',async()=>{
  const build=await validateWebBuild(pongFiles,target(pong)), file=build.files.find(f=>f.path==='index.html'),bytes=pongFiles.find(f=>f.path==='index.html').bytes
  const identity={gameId:pong.gameId,versionId:'33333333-3333-4333-8333-333333333333',artifactSha256:build.artifactSha256}
  let written=false
  const bucket={async put(key,data,options){assert.ok(key.endsWith('/client/index.html'));assert.equal(options.onlyIf.get('If-None-Match'),'*');assert.equal(options.httpMetadata.cacheControl,'no-store');if(written)return null;written=true;return {}}}
  await putArtifactFile(bucket,identity,file,bytes)
  await assert.rejects(putArtifactFile(bucket,identity,file,bytes),/ALREADY_EXISTS/)
  await assert.rejects(putArtifactFile(bucket,identity,file,encoder.encode('changed')),/HASH_MISMATCH/)
})
test('manifest validation runs as a portable browser bundle with runtime code generation forbidden',async()=>{
  const result=await bundle({stdin:{contents:"import {validateManifest} from './lib/game-distribution/manifest.ts'; globalThis.checkManifest=validateManifest",resolveDir:process.cwd()},
    bundle:true,format:'iife',platform:'browser',write:false,metafile:true})
  assert.ok(!Object.keys(result.metafile.inputs).some(path=>/node_modules\/(?:react|next|ajv)|@chibaskogames/.test(path)))
  const context={TextEncoder}
  runInNewContext(result.outputFiles[0].text,context,{codeGeneration:{strings:false,wasm:false}})
  assert.equal(context.checkManifest(pong,target(pong)).gameId,pong.gameId)
})

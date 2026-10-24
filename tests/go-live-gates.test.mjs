import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readReference,compareSchema} from '../scripts/schema-drift.mjs'
import {catalogueGameId} from '../scripts/catalogue-game-id.mjs'
import {readJson} from '../scripts/read-json.mjs'
import {mkdtemp,writeFile,unlink,rmdir,readdir,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const id='11111111-1111-4111-8111-111111111111',capabilities={online:{access:['public','private'],players:{min:2,max:2}}}
test('catalogue lookup requires one exact UUID identity and compatible active capabilities',()=>{
 const row={id,slug:'fixture-game',gameType:'multiplayer_chibasko',activeVersionId:null}
 assert.equal(catalogueGameId([row],row.slug,capabilities).capabilitiesStatus,'DIFFERENCE_EXPECTED')
 for(const rows of [[],[row,row],[{...row,slug:'other'}],[{...row,id:'00000000-0000-4000-8000-000000000001'}]])assert.throws(()=>catalogueGameId(rows,row.slug,capabilities))
 const active={...row,activeVersionId:'22222222-2222-4222-8222-222222222222',versionGameId:id,versionStatus:'published',manifest:{gameId:id,capabilities}}
 assert.equal(catalogueGameId([active],row.slug,capabilities).status,'PASS')
 assert.throws(()=>catalogueGameId([{...active,versionGameId:'other'}],row.slug,capabilities))
 assert.throws(()=>catalogueGameId([active],row.slug,{local:{players:{min:1,max:1}}}))
 assert.equal(catalogueGameId([{...row,gameType:'classic'}],row.slug,{local:{players:{min:1,max:1}}},'classic').status,'PASS')
})
test('schema reference is tied to migration bytes and rejects partial or unrecognized objects',async()=>{
 const ref=await readReference()
 assert.equal(ref.stages.length,ref.migrations.length+1)
 assert.throws(()=>compareSchema({format:1,readOnly:false},ref),/invalid_snapshot/)
 const p={columns:{},roles:{},legacyPolicies:[]}
 const result=compareSchema({format:1,readOnly:true,objects:{unexpected:{value:true}},prerequisites:p},ref)
 assert.equal(result.status,'BLOCKING_DRIFT')
 assert.ok(result.rows.some(row=>row.object==='unexpected' && row.status==='BLOCKING_DRIFT'))
})
test('un préfixe cohérent ne valide pas un schéma incomplet pour le code actuel',async()=>{
 const ref=await readReference()
 for(let index=0;index<ref.stages.length-1;index++){
  const result=compareSchema({format:1,readOnly:true,objects:ref.stages[index],prerequisites:ref.prerequisites},ref)
  assert.equal(result.status,'MIGRATIONS_REQUIRED')
  assert.equal(result.pendingMigrations.length,ref.migrations.length-index)
 }
 assert.equal(compareSchema({format:1,readOnly:true,objects:ref.stages.at(-1),prerequisites:ref.prerequisites},ref).status,'PASS')
})
test('les objets indispensables au portail développeur et à l’administration sont contrôlés',async()=>{
 const ref=await readReference(),objects=ref.stages.at(-1)
 const admin=Object.keys(objects).find(key=>key.startsWith('function:admin_save_game('))
 assert.ok(admin,'Contrat de la RPC admin manquant')
 for(const key of ['table:developer_contacts','table:game_submission_notifications','table:game_submission_drafts',
  'table:game_developer_registrations','table:game_submissions','table:profiles','table:categories',
  admin]){
  assert.ok(objects[key],key)
  const incomplete={...objects};delete incomplete[key]
  assert.notEqual(compareSchema({format:1,readOnly:true,objects:incomplete,prerequisites:ref.prerequisites},ref).status,'PASS',key)
 }
})
test('les tables et RPC littérales utilisées par l’application figurent dans la référence',async()=>{
 const ref=await readReference(),objects=ref.stages.at(-1),tables=new Set(),functions=new Set()
 for(const directory of ['app','components','lib']){
  const root=new URL('../'+directory+'/',import.meta.url)
  for(const name of await readdir(root,{recursive:true})){
   if(!/\.(?:ts|tsx)$/.test(name))continue
   const source=await readFile(join(fileURLToPath(root),name),'utf8')
   for(const match of source.matchAll(/\.from\(\s*['"]([a-z_]+)['"]/g))tables.add(match[1])
   for(const match of source.matchAll(/\brpc\(\s*['"]([a-z_]+)['"]/g))functions.add(match[1])
  }
 }
 assert.ok(tables.size>10)
 assert.ok(functions.size>5)
 for(const name of tables)assert.ok(objects['table:'+name],name)
 for(const name of functions)assert.ok(Object.keys(objects).some(key=>key.startsWith('function:'+name+'(')),name)
})
test('metadata readers accept UTF-8 BOM and PowerShell UTF-16LE without changing values',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'chibasko-json-reader-')),files=[join(directory,'utf8.json'),join(directory,'utf16.json')]
 try {
  await writeFile(files[0],Buffer.concat([Buffer.from([239,187,191]),Buffer.from('{"format":1}')]))
  await writeFile(files[1],Buffer.concat([Buffer.from([255,254]),Buffer.from('{"format":1}','utf16le')]))
  for(const file of files)assert.deepEqual(await readJson(file),{format:1})
 } finally {for(const file of files)await unlink(file).catch(()=>{});await rmdir(directory)}
})

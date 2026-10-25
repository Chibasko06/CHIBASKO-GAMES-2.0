import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { localChecks, environmentChecks, environments, sqlSha256 } from '../scripts/production-preflight.mjs'
import {mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'

test('la suppression des comptes exige la reprise technique des uploads',()=>{
 const checks=environmentChecks('maintenance',{GAME_ACCOUNT_DELETIONS_ENABLED:'1',GAME_UPLOAD_MAINTENANCE_ENABLED:'0'})
 assert.equal(checks.find(item=>item.check==='GAME_UPLOAD_MAINTENANCE_ENABLED:account_recovery').ok,false)
 assert.equal(environmentChecks('maintenance',{GAME_ACCOUNT_DELETIONS_ENABLED:'1',GAME_UPLOAD_MAINTENANCE_ENABLED:'1'}).find(item=>item.check==='GAME_UPLOAD_MAINTENANCE_ENABLED:account_recovery').ok,true)
})

test('le contact reste optionnel et exige une configuration serveur complète à son activation',()=>{
 assert.equal(environmentChecks('portal',{}).some(item=>item.check==='CONTACT_HASH_SECRET:length'),false)
 const checks=environmentChecks('portal',{CONTACT_FORM_ENABLED:'1'})
 assert.equal(checks.find(item=>item.check==='CONTACT_HASH_SECRET:length').ok,false)
 const complete=environmentChecks('portal',{CONTACT_FORM_ENABLED:'1',CONTACT_NOTIFY_EMAIL:'contact@example.test',CONTACT_HASH_SECRET:'s'.repeat(32),RESEND_FROM_EMAIL:'from@example.test',RESEND_API_KEY:'fixture'})
 assert.equal(complete.filter(item=>item.check.includes('contact')||item.check==='CONTACT_HASH_SECRET:length').every(item=>item.ok),true)
 assert.ok(!JSON.stringify(complete).includes('contact@example.test'))
})

test('production notifications require server configuration on portal and enabled maintenance only',()=>{
 const base={GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'1'}
 for(const component of ['portal','maintenance']){
  const checks=environmentChecks(component,base)
  assert.equal(checks.find(c=>c.check==='GAME_SUBMISSION_NOTIFY_EMAIL:email').ok,false)
  const ready=environmentChecks(component,{...base,RESEND_API_KEY:'fixture-secret',RESEND_FROM_EMAIL:'Games <from@example.test>',GAME_SUBMISSION_NOTIFY_EMAIL:'admin@example.test'})
  assert.equal(ready.filter(c=>/submission_notifications|:email|no_newline/.test(c.check)).every(c=>c.ok),true)
  assert.doesNotMatch(JSON.stringify(ready),/fixture-secret|admin@example/)
 }
 assert.equal(environmentChecks('maintenance',{GAME_SUBMISSION_NOTIFICATIONS_ENABLED:'0'}).some(c=>c.check==='GAME_SUBMISSION_NOTIFY_EMAIL:email'),false)
})

test('local inventory checks registry dependencies and ordered transactional migrations', async () => {
  const result = await localChecks(fileURLToPath(new URL('../', import.meta.url)))
  assert.equal(result.checks.every(check => check.ok), true)
  assert.equal(result.migrations.length, 22)
  assert.equal(result.migrations.at(-1).name,'20261025000300_admin_console.sql')
  assert.equal(result.baselineMigrations.length, 15)
  assert.equal(result.migrations.every(item => /^[a-f0-9]{64}$/.test(item.sha256)), true)
})
test('les empreintes SQL restent identiques entre les checkouts Windows et Linux',()=>{
 assert.equal(sqlSha256(Buffer.from('begin;\r\ncommit;\r\n')),sqlSha256(Buffer.from('begin;\ncommit;\n')))
 assert.notEqual(sqlSha256(Buffer.from('select 1;')),sqlSha256(Buffer.from('select 2;')))
})
test('une migration hors de l’ancien intervalle de dates bloque le préflight',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),directory=await mkdtemp(join(tmpdir(),'chibasko-preflight-'))
 try{
  for(const path of ['package.json','package-lock.json','supabase/migrations','contracts/production-schema.v1.json','docs/sql/production-schema-snapshot.sql']){
   const target=join(directory,path);await mkdir(dirname(target),{recursive:true});await cp(join(root,path),target,{recursive:true})
  }
  assert.equal((await localChecks(directory)).checks.every(check=>check.ok),true)
  await writeFile(join(directory,'supabase/migrations/20261024000100_unknown.sql'),'begin;\ncommit;\n')
  assert.equal((await localChecks(directory)).checks.find(check=>check.check==='migration_order').ok,false)
 }finally{await rm(directory,{recursive:true,force:true})}
})
test('missing environment fails without printing secret values', () => {
  const checks = environmentChecks('portal', { SUPABASE_SERVICE_ROLE_KEY: 'fixture-not-a-credential' })
  assert.equal(checks.every(check => check.ok), false)
  assert.equal(JSON.stringify(checks).includes('fixture-not-a-credential'), false)
  assert.throws(() => environmentChecks('unknown', {}), /unknown_component/)
})
test('registrable content sites work without PRIVATE PSL and remain separate from the portal', () => {
  const env = Object.fromEntries(environments.gateway.map(name => [name, 'fixture']))
  Object.assign(env, { SUPABASE_URL: 'https://database.example', GAME_CONTENT_BASE_DOMAIN: 'github.io',
    GAME_CONTENT_PUBLIC_BASE: 'github.io', GAME_CONTENT_PREVIEW_BASE: 'github.io', GAME_PORTAL_ORIGINS: 'https://portal.example', GAME_ARTIFACT_GATEWAY_ENABLED: '0' })
  // Known PSL entry used only as parser input. No request or deployment to this domain.
  assert.equal(environmentChecks('gateway', env).every(check => check.ok), true)
  env.GAME_CONTENT_BASE_DOMAIN = 'chibaskogames-play.fr'
  assert.equal(environmentChecks('gateway', env).every(check => check.ok), true)
  env.GAME_CONTENT_BASE_DOMAIN = 'sub.chibaskogames-play.fr'
  assert.equal(environmentChecks('gateway', env).find(check => check.check === 'content_registrable_boundary').ok, false)
  env.GAME_CONTENT_BASE_DOMAIN = 'github.io'
  env.GAME_PORTAL_ORIGINS = 'https://other.github.io'
  assert.equal(environmentChecks('gateway', env).find(check => check.check === 'GAME_CONTENT_BASE_DOMAIN:separate_site').ok, false)
})
test('validator requires separate buckets and canonical resource identifiers', () => {
  const env = Object.fromEntries(environments.validator.map(name => [name, 'fixture']))
  Object.assign(env, { SUPABASE_URL: 'https://database.example', GAME_BUILDS_R2_ACCOUNT_ID: 'a'.repeat(32), GAME_BUILDS_QUEUE_ID: 'b'.repeat(32), GAME_BUILDS_STAGING_BUCKET: 'staging-fixture', GAME_BUILDS_ARTIFACTS_BUCKET: 'artifacts-fixture' })
  assert.equal(environmentChecks('validator', env).every(check => check.ok), true)
  env.GAME_BUILDS_ARTIFACTS_BUCKET = env.GAME_BUILDS_STAGING_BUCKET
  assert.equal(environmentChecks('validator', env).find(check => check.check === 'separate_buckets').ok, false)
})

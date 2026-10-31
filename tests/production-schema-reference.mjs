import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:net'
import assert from 'node:assert/strict'
import {migrations,baselineMigrations,sqlSha256} from '../scripts/production-preflight.mjs'
import {compareSchema} from '../scripts/schema-drift.mjs'

// Seul ce générateur écrit dans son cluster jetable ; le comparateur reste hors ligne.
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url))
const bin=process.env.CATALOGUE_TEST_PG_BIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'')
const tool=name=>bin?join(bin,name+(process.platform==='win32'?'.exe':'')):name
const directory=await mkdtemp(join(tmpdir(),'chibasko-schema-reference-')),data=join(directory,'data')
const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve))
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve))
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('PG')))
env.PGCLIENTENCODING='UTF8'
const run=(name,args)=>name!=='pg_ctl'?exec(tool(name),args,{env,timeout:60000,maxBuffer:8*1024*1024}):new Promise((resolve,reject)=>{
 const child=spawn(tool(name),args,{env,stdio:'ignore',windowsHide:true})
 child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('disposable_cluster_failed')))
})
let started=false
try {
 await run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale'])
 await run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true
 const args=['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres']
 const query=sql=>run('psql',[...args,'-qAtc',sql])
 await run('psql',[...args,'-f',join(root,'tests/production-schema-base.sql')])
 const baseline=[]
 for(const name of baselineMigrations) {
  const file=join(root,'supabase/migrations',name)
  if(name==='20260505_profiles_reactions_and_xp.sql') {
   // Le changement historique du type de retour ne peut pas être rejoué tel quel.
   // La fixture vérifie ce défaut avant de reconstruire le contrat final connu.
   await assert.rejects(run('psql',[...args,'--single-transaction','-f',file]),error=>/return type|type de retour/i.test(error.stderr))
   await query('drop function public.get_game_public_stats()')
  }
  await run('psql',[...args,'-f',file])
  baseline.push({name,sha256:sqlSha256(await readFile(file))})
 }
 const snapshot=async()=>JSON.parse((await run('psql',[...args,'-f',join(root,'docs/sql/production-schema-snapshot.sql')])).stdout)
 const base=await snapshot(),snapshots=[base],reference={format:1,baselineMigrations:baseline,prerequisites:base.prerequisites,
  snapshotSha256:sqlSha256(await readFile(join(root,'docs/sql/production-schema-snapshot.sql'))),
  migrations:[],stages:[base.objects]}
 await assert.rejects(run('psql',[...args,'-f',join(root,'supabase/migrations/20261029000200_profile_privacy.sql')]),error=>/profile_public_projection_required/.test(error.stderr));
 assert.deepEqual(await snapshot(),base,'Une fermeture prématurée ne modifie aucun privilège');
 for(const name of migrations) {
  if(name==='20261029000200_profile_privacy.sql') {
   await query('grant select(display_name) on public.profiles to anon');
   await run('psql',[...args,'-f',join(root,'docs/sql/profile-privacy-preflight.sql')]);
  }
  if(name==='20261024000100_account_deletion.sql')await run('psql',[...args,'-f',join(root,'tests/account-lifecycle-db.sql')])
  const file=join(root,'supabase/migrations',name)
  if(name==='20261028000100_public_usernames.sql'){
   const first='fc200000-0000-4000-8000-000000000001',second='fc200000-0000-4000-8000-000000000002'
   await query(`insert into auth.users(id,email) values('${first}','username-preflight-a@example.test'),('${second}','username-preflight-b@example.test');update public.profiles set username='nom invalide' where id='${first}'`)
   await assert.rejects(run('psql',[...args,'-f',file]),error=>/public_username_preflight_invalid/.test(error.stderr))
   await query(`update public.profiles set username='Pseudo-Migre' where id='${first}';update public.profiles set username='pseudo-migre' where id='${second}'`)
   await assert.rejects(run('psql',[...args,'-f',file]),error=>/public_username_preflight_collision/.test(error.stderr))
   await query(`update public.profiles set username='migration-second' where id='${second}'`)
  }
  if(name==='20261101000100_social_notifications.sql')await query("insert into auth.users(id,email) values('fa410000-0000-4000-8000-000000000001','historical-a@example.test'),('fa410000-0000-4000-8000-000000000002','historical-b@example.test');insert into public.social_relationships(user_low,user_high,requester,state) values('fa410000-0000-4000-8000-000000000001','fa410000-0000-4000-8000-000000000002','fa410000-0000-4000-8000-000000000001','pending')")
  await run('psql',[...args,'-f',file])
  if(name==='20261101000100_social_notifications.sql'){
   assert.equal((await query('select count(*) from public.social_notifications')).stdout.trim(),'0','Les demandes historiques ne créent aucun nouvel événement');
   await query("delete from public.profiles where id::text like 'fa410000-%'");
  }
  if(name==='20261029000100_profile_public_projection.sql'){
   assert.equal((await query("select has_table_privilege('anon','public.profiles','SELECT') and has_table_privilege('anon','public.public_profiles','SELECT')")).stdout.trim(),'t','La phase additive préserve les anciens consommateurs jusqu’au déploiement applicatif');
  }
  if(name==='20261028000100_public_usernames.sql'){
   assert.equal((await query("select username from public.profiles where id='fc200000-0000-4000-8000-000000000001'")).stdout.trim(),'pseudo-migre')
   await query("delete from public.profiles where id::text like 'fc200000-%'")
  }
  reference.migrations.push({name,sha256:sqlSha256(await readFile(file))})
  const state=await snapshot();snapshots.push(state);reference.stages.push(state.objects)
 }
 const final=await snapshot()
 await assert.rejects(run('psql',[...args,'-f',join(root,'supabase/migrations/20261024000100_account_deletion.sql')]))
 assert.equal(compareSchema(base,reference).status,'MIGRATIONS_REQUIRED',JSON.stringify(compareSchema(base,reference).rows.filter(row=>row.status==='BLOCKING_DRIFT')))
 assert.equal(compareSchema(base,reference).rows.some(row=>row.status==='DIFFERENCE_EXPECTED'),true)
 assert.equal(compareSchema(final,reference).status,'PASS')
 for(const [index,state] of snapshots.entries()) {
  const result=compareSchema(state,reference)
  assert.equal(result.status,index===migrations.length?'PASS':'MIGRATIONS_REQUIRED');assert.equal(result.matchedMigrationCount,index)
 }
 await query('create role fixture_auditor nologin')
 for(const sql of ['alter table public.game_server_credentials disable row level security',
  'grant select on public.game_connection_tickets to authenticated',
  'grant execute on function public.distribution_cleanup_sessions() to public',
  'alter table public.game_versions add column unexpected text',
  'alter table public.game_versions disable trigger guard_game_version',
  'grant select on public.game_connection_tickets to fixture_auditor',
  'alter function public.distribution_cleanup_sessions() security definer',
  'drop index public.game_versions_game_status_idx',
  'alter table public.game_versions drop constraint game_versions_game_id_fkey']) {
  await query('begin;'+sql+';commit;')
  assert.equal(compareSchema(await snapshot(),reference).status,'BLOCKING_DRIFT',sql)
  if(sql.includes('disable row'))await query('alter table public.game_server_credentials enable row level security')
  if(sql.includes('grant select'))await query('revoke select on public.game_connection_tickets from authenticated')
  if(sql.includes('grant execute'))await query('revoke execute on function public.distribution_cleanup_sessions() from public')
  if(sql.includes('add column'))await query('alter table public.game_versions drop column unexpected')
  if(sql.includes('disable trigger'))await query('alter table public.game_versions enable trigger guard_game_version')
  if(sql.includes('to fixture_auditor'))await query('revoke select on public.game_connection_tickets from fixture_auditor')
  if(sql.includes('security definer'))await query('alter function public.distribution_cleanup_sessions() security invoker')
  if(sql.startsWith('drop index'))await query(reference.stages.at(-1)['index:game_versions_game_status_idx'].definition)
  if(sql.includes('drop constraint'))await query('alter table public.game_versions add constraint game_versions_game_id_fkey foreign key(game_id) references public.games(id) on delete restrict')
 }
 assert.equal(compareSchema(await snapshot(),reference).status,'PASS')
 for(const [change,restore] of [
  ['alter table storage.objects disable row level security','alter table storage.objects enable row level security'],
  ['alter policy chibasko_legacy_storage_no_insert on storage.objects with check(true)',"alter policy chibasko_legacy_storage_no_insert on storage.objects with check(bucket_id not in ('avatars','game-thumbnails'))"],
  ['alter table public.profiles disable row level security','alter table public.profiles enable row level security'],
  ['grant select(display_name) on public.profiles to anon','revoke select(display_name) on public.profiles from anon'],
  ['alter view public.public_profiles set (security_invoker=true)','alter view public.public_profiles set (security_invoker=false)'],
  ['grant update on public.public_profiles to authenticated','revoke update on public.public_profiles from authenticated'],
  ['grant select on public.developer_contacts to anon','revoke select on public.developer_contacts from anon'],
  ['alter table public.categories rename column name to missing_name','alter table public.categories rename column missing_name to name'],
  ['drop trigger initialize_submission_draft on public.game_developer_registrations',reference.stages.at(-1)['trigger:game_developer_registrations:initialize_submission_draft'].definition],
 ]) {
  await query(change)
  assert.equal(compareSchema(await snapshot(),reference).status,'BLOCKING_DRIFT',change)
  await query(restore)
 }
 const currentAdminSave=(await query("select pg_get_functiondef('public.admin_save_game(uuid,jsonb,uuid[],uuid,text)'::regprocedure)")).stdout
 await query('drop function public.admin_save_game(uuid,jsonb,uuid[],uuid,text)')
 assert.equal(compareSchema(await snapshot(),reference).status,'BLOCKING_DRIFT','RPC admin absente après migrations de cycle de vie')
 await query(currentAdminSave+";revoke all on function public.admin_save_game(uuid,jsonb,uuid[],uuid,text) from public,anon,authenticated;grant execute on function public.admin_save_game(uuid,jsonb,uuid[],uuid,text) to service_role;")
 assert.equal(compareSchema(await snapshot(),reference).status,'PASS')
 for(const role of ['anon','authenticated'])await assert.rejects(query(`set role ${role};select public.admin_save_game(null,'{}','{}')`),error=>/permission denied|permission refusée/i.test(error.stderr))
 await run('psql',[...args,'-f',join(root,'docs/sql/profile-privacy-preflight.sql')]);
 const preflight=await run('psql',[...args,'-f',join(root,'docs/sql/production-preflight.sql')])
 assert.match(preflight.stdout,/admin_save_game/)
 assert.match(preflight.stdout,/developer_contacts/)
 for(const name of ['catalogue_page','catalogue_home','catalogue_admin_users','catalogue_recent_history'])assert.match(preflight.stdout,new RegExp(name))
 if(!process.argv.includes('--focus-measures')){
 await run('psql',[...args,'-f',join(root,'tests/public-profile-directory-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/admin-profile-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/admin-console-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/public-usernames-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/profile-privacy-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/social-db.sql')])
 const {socialConcurrency}=await import('./social-concurrency.mjs')
 await socialConcurrency(async sql=>(await query(sql)).stdout.trim())
 const {publicUsernamesConcurrency}=await import('./public-usernames-concurrency.mjs')
 await publicUsernamesConcurrency(async sql=>(await query(sql)).stdout.trim())
 await run('psql',[...args,'-f',join(root,'tests/account-deletion-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/account-storage-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/contact-db.sql')])
 await run('psql',[...args,'-f',join(root,'tests/maintenance-db.sql')])
 const catalogueTest=await run('psql',[...args,'-f',join(root,'tests/catalogue-pagination-db.sql')])
 console.log(catalogueTest.stdout)
 const notificationActor='e1111111-1111-4111-8111-111111111111',notificationUpload='e2222222-2222-4222-8222-222222222222',notificationId='e3333333-3333-4333-8333-333333333333'
 await query(`insert into auth.users(id,email) values('${notificationActor}','concurrency@example.test');
 insert into public.developer_contacts(user_id,first_name,last_name,contact_email,public_name) values('${notificationActor}','Test','Maintenance','contact@example.test','Studio');
 insert into public.game_build_uploads(id,game_id,created_by,request_id,version,status,expected_size,policy,expires_at)
 values('${notificationUpload}',public.distribution_register_game('${notificationActor}',gen_random_uuid(),'Test notification'),'${notificationActor}',gen_random_uuid(),'1.0.0','queued',100,'{"revision":"1","maxAttempts":3}',now()+interval '1 day');
 insert into public.game_submissions(id,name_or_studio,email,game_title,demo_url,game_type,description,build_upload_id)
 values('${notificationId}','Studio','contact@example.test','Jeu','https://example.test','web','Description','${notificationUpload}')`)
 const notifications=await Promise.all([1,2].map(()=>query(`select coalesce(public.distribution_claim_submission_email('${notificationId}'),'null'::jsonb)`)))
 const notificationClaims=notifications.map(result=>JSON.parse(result.stdout.trim())).filter(Boolean)
 assert.equal(notificationClaims.length,1,'Deux workers ne réservent pas la même notification')
 await query(`update public.game_submission_notifications set lease_until=now()-interval '1 second' where submission_id='${notificationId}'`)
 const replacement=JSON.parse((await query(`select public.distribution_claim_submission_email('${notificationId}')`)).stdout.trim())
 assert.notEqual(replacement.lease,notificationClaims[0].lease)
 await assert.rejects(query(`select public.distribution_finish_submission_email('${notificationId}','${notificationClaims[0].lease}',true)`),error=>/lease_lost/.test(error.stderr))
 await query(`select public.distribution_finish_submission_email('${notificationId}','${replacement.lease}',true)`)
 const reserves=await Promise.all([0,1].map(()=>query("select public.contact_reserve('aaaaaaaa-cccc-4aaa-8aaa-aaaaaaaaaaaa',repeat('a',64),repeat('b',64),repeat('c',64))")))
 assert.deepEqual(reserves.map(result=>JSON.parse(result.stdout.trim()).state).sort(),['send','waiting'])
 await query('delete from public.contact_dispatches')
 const {accountDeletionConcurrency}=await import('./account-deletion-concurrency.mjs')
 await accountDeletionConcurrency(async sql=>(await query(sql)).stdout.trim())
 // Holding the same advisory lock in another connection must make duplicate maintenance a no-op.
 const holding=query('begin;select pg_advisory_xact_lock(1667721069,1936028515);select pg_sleep(2);commit;')
 await new Promise(resolve=>setTimeout(resolve,300))
 assert.equal((await query('set role service_role;select public.distribution_cleanup_sessions()')).stdout.trim(),'f')
 await holding
 assert.equal((await query('set role service_role;select public.distribution_cleanup_sessions();select public.distribution_cleanup_sessions()')).stdout.trim().replaceAll('\r\n','\n'),'t\nt')
 await assert.rejects(query('set role anon;select public.distribution_cleanup_sessions()'))
 const {socialInterfaceIntegration}=await import('./social-interface-db.mjs')
 await socialInterfaceIntegration(async sql=>(await query(sql)).stdout.trim())
 const {socialNotificationsIntegration}=await import('./social-notifications-db.mjs')
 await socialNotificationsIntegration(async sql=>(await query(sql)).stdout.trim())
 const {moderationIntegration}=await import('./moderation-db.mjs')
 await moderationIntegration(async sql=>(await query(sql)).stdout.trim())
 }
 const {moderationMeasuresIntegration}=await import('./moderation-measures-db.mjs')
 await moderationMeasuresIntegration(async sql=>(await query(sql)).stdout.trim())
 const output=join(root,'contracts/production-schema.v1.json')
 if(process.argv.includes('--write')){await mkdir(join(root,'contracts'),{recursive:true});await writeFile(output,JSON.stringify(reference)+'\n')}
 else assert.deepEqual(JSON.parse(await readFile(output,'utf8')),reference,'Regenerate the reviewed schema reference after a migration change')
 console.log('Schema drift PASS: every migration prefix, RLS/grants/function access/columns/triggers, cleanup fencing/idempotence and browser denial, disposable PostgreSQL only.')
} finally {if(started)await run('pg_ctl',['-D',data,'-m','fast','-w','stop'])}

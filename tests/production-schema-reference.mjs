import {execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createServer} from 'node:net'
import {createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import {migrations} from '../scripts/production-preflight.mjs'
import {compareSchema} from '../scripts/schema-drift.mjs'

// Only this fixture builder writes a disposable database; the drift CLI never connects or writes.
const exec=promisify(execFile),root=fileURLToPath(new URL('../',import.meta.url))
const bin=process.env.CATALOGUE_TEST_PG_BIN??(process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'')
const tool=name=>bin?join(bin,name+(process.platform==='win32'?'.exe':'')):name
const directory=await mkdtemp(join(tmpdir(),'chibasko-schema-reference-')),data=join(directory,'data')
const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve))
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve))
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('PG')))
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
 await query(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create table public.profiles(id uuid primary key references auth.users(id),username text not null);
 create table public.admin_users(user_id uuid primary key references auth.users(id));
 alter table public.admin_users enable row level security;
 create table public.games(id uuid primary key,title text not null,slug text not null unique,game_url text,is_published boolean not null default false,
 game_type text not null default 'classic',multiplayer_game_id text,is_beta boolean not null default false);
 alter table public.games enable row level security;
 grant select on public.games to anon,authenticated;
 create policy "public can read published games" on public.games for select to anon,authenticated using (is_published = true);
 grant select,insert,update,delete on public.games,public.admin_users to service_role;
 grant select on public.profiles to service_role;`)
 const snapshot=async()=>JSON.parse((await run('psql',[...args,'-f',join(root,'docs/sql/production-schema-snapshot.sql')])).stdout)
 const base=await snapshot(),snapshots=[base],reference={format:1,migrations:[],stages:[base.objects]}
 for(const name of migrations) {
  const file=join(root,'supabase/migrations',name)
  await run('psql',[...args,'-f',file])
  reference.migrations.push({name,sha256:createHash('sha256').update(await readFile(file)).digest('hex')})
  const state=await snapshot();snapshots.push(state);reference.stages.push(state.objects)
 }
 const final=await snapshot()
 assert.equal(compareSchema(base,reference).status,'PASS',JSON.stringify(compareSchema(base,reference).rows.filter(row=>row.status==='BLOCKING_DRIFT')))
 assert.equal(compareSchema(base,reference).rows.some(row=>row.status==='DIFFERENCE_EXPECTED'),true)
 assert.equal(compareSchema(final,reference).status,'PASS')
 for(const [index,state] of snapshots.entries()) {
  const result=compareSchema(state,reference)
  assert.equal(result.status,'PASS');assert.equal(result.matchedMigrationCount,index)
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
  if(sql.startsWith('drop index'))await query(reference.stages.at(-1)['index:game_versions_game_status_idx'])
  if(sql.includes('drop constraint'))await query('alter table public.game_versions add constraint game_versions_game_id_fkey foreign key(game_id) references public.games(id) on delete restrict')
 }
 assert.equal(compareSchema(await snapshot(),reference).status,'PASS')
 // Holding the same advisory lock in another connection must make duplicate maintenance a no-op.
 const holding=query('begin;select pg_advisory_xact_lock(1667721069,1936028515);select pg_sleep(2);commit;')
 await new Promise(resolve=>setTimeout(resolve,300))
 assert.equal((await query('set role service_role;select public.distribution_cleanup_sessions()')).stdout.trim(),'f')
 await holding
 assert.equal((await query('set role service_role;select public.distribution_cleanup_sessions();select public.distribution_cleanup_sessions()')).stdout.trim().replaceAll('\r\n','\n'),'t\nt')
 await assert.rejects(query('set role anon;select public.distribution_cleanup_sessions()'))
 const output=join(root,'contracts/production-schema.v1.json')
 if(process.argv.includes('--write')){await mkdir(join(root,'contracts'),{recursive:true});await writeFile(output,JSON.stringify(reference)+'\n')}
 else assert.deepEqual(JSON.parse(await readFile(output,'utf8')),reference,'Regenerate the reviewed schema reference after a migration change')
 console.log('Schema drift PASS: every migration prefix, RLS/grants/function access/columns/triggers, cleanup fencing/idempotence and browser denial, disposable PostgreSQL only.')
} finally {if(started)await run('pg_ctl',['-D',data,'-m','fast','-w','stop'])}

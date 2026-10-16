import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'

// Own disposable loopback cluster. No Supabase client, URL or inherited PG DSN.
const exec = promisify(execFile)
const bin = process.env.CATALOGUE_TEST_PG_BIN ?? (process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'')
const tool = name => bin?join(bin,name+(process.platform==='win32'?'.exe':'')):name
const directory = await mkdtemp(join(tmpdir(),'chibasko-distribution-db-')), data=join(directory,'data')
const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve))
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.toUpperCase().startsWith('PG')))
const run=(name,args)=>name!=='pg_ctl'?exec(tool(name),args,{env,timeout:60000,maxBuffer:1024*1024}):new Promise((resolve,reject)=>{
  const child=spawn(tool(name),args,{env,stdio:'ignore',windowsHide:true})
  child.once('error',reject);child.once('exit',code=>code===0?resolve({stdout:''}):reject(new Error('pg_ctl failed; inspect '+directory)))
})
let started=false
try {
  await run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale'])
  await run('pg_ctl',['-D',data,'-l',join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);started=true
  const base=['-X','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(port),'-U','postgres']
  await run('psql',[...base,'-d','postgres','-c','create database chibasko_distribution_test'])
  const args=[...base,'-d','chibasko_distribution_test']
  await run('psql',[...args,'-f',fileURLToPath(new URL('./game-distribution-db.sql',import.meta.url))])
  await assert.rejects(run('psql',[...args,'-f',fileURLToPath(new URL('../supabase/migrations/20261016000100_game_distribution_versions.sql',import.meta.url))]))
  const race=await Promise.allSettled([
    run('psql',[...args,'-c',"set role service_role;select public.set_active_game_version('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444')"]),
    run('psql',[...args,'-c',"set role service_role;update public.game_versions set status='archived' where id='44444444-4444-4444-8444-444444444444'"]),
  ])
  assert.equal(race.filter(value=>value.status==='fulfilled').length,1)
  const check=await run('psql',[...args,'-Atc',"select count(*) from public.games g join public.game_versions v on v.id=g.active_version_id where v.game_id<>g.id or v.status<>'published'"])
  assert.equal(check.stdout.trim(),'0')
  console.log('Disposable SQL passed: preserved catalogue, private RLS, immutable payload, lifecycle, same-game active pointer, rollback, archive/activation race and reapplication refusal.')
} finally { if(started)await run('pg_ctl',['-D',data,'-m','fast','-w','stop']) }

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'
import assert from 'node:assert/strict'

// Own disposable loopback cluster. No Supabase client, URL or inherited PG DSN.
const exec = promisify(execFile)
const bin = process.env.CATALOGUE_TEST_PG_BIN ?? (process.platform==='win32'?'C:/Program Files/PostgreSQL/18/bin':'')
const tool = name => bin?join(bin,name+(process.platform==='win32'?'.exe':'')):name
const pong=process.argv.includes('--pong')
const multiplayer=pong||process.argv.includes('--multiplayer');if(multiplayer)process.argv.push('--online');
const online=process.argv.includes('--online');if(online)process.argv.push('--launches')
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
  if(process.argv.includes('--uploads') || process.argv.includes('--previews') || process.argv.includes('--launches')) {
    await run('psql',[...args,'-f',fileURLToPath(new URL('./game-upload-db.sql',import.meta.url))])
    const finalizers=await Promise.allSettled([1,2].map(()=>run('psql',[...args,'-c',"set role service_role;select public.distribution_begin_finalize('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','77777777-7777-4777-8777-777777777777');select public.distribution_enqueue_upload('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','77777777-7777-4777-8777-777777777777','etag')"])))
    assert.equal(finalizers.filter(r=>r.status==='fulfilled').length,2)
    const outbox=await run('psql',[...args,'-Atc',"select count(*) from public.game_build_outbox where upload_id='77777777-7777-4777-8777-777777777777'"])
    assert.equal(outbox.stdout.trim(),'1')
    const uploadRace=await Promise.allSettled(['88888888-8888-4888-8888-888888888888','99999999-9999-4999-8999-999999999999'].map(id=>
      run('psql',[...args,'-c',`set role service_role;select public.distribution_complete('${id}',(select lease_token from public.game_build_uploads where id='${id}'))`])))
    assert.equal(uploadRace.filter(r=>r.status==='fulfilled').length,2)
    const counts=await run('psql',[...args,'-Atc',"select (select count(*) from public.game_versions where version='3.0.0')||':'||(select count(*) from public.game_build_uploads where status='completed')||':'||(select count(*) from public.game_build_uploads where error_code='version_conflict')"])
    assert.equal(counts.stdout.trim(),'1:1:1')
    console.log('Upload SQL passed: ownership/admin/IDOR/RLS, expiration, idempotence, outbox, lease fencing, revocation, retry and concurrent version uniqueness.')
  }
  if(process.argv.includes('--previews') || process.argv.includes('--launches')) {
    await run('psql',[...args,'-f',fileURLToPath(new URL('./game-artifact-db.sql',import.meta.url))])
    const exchanges=await Promise.allSettled(['2','3'].map(hash=>run('psql',[...args,'-c',`set role service_role;select public.distribution_exchange_preview('fafafafa-fafa-4afa-8afa-fafafafafafa',repeat('1',64),repeat('${hash}',64))`])))
    assert.equal(exchanges.filter(result=>result.status==='fulfilled').length,1)
    const consumed=await run('psql',[...args,'-Atc',"select count(*) from public.game_preview_sessions where id='fafafafa-fafa-4afa-8afa-fafafafafafa' and consumed_at is not null and cookie_hash is not null"])
    assert.equal(consumed.stdout.trim(),'1')
    console.log('Preview SQL passed: private RLS/RPCs, owner/editor/admin/reviewer, IDOR, expiry, current permission revocation, approved policies, cleanup and concurrent one-time exchange.')
  }
  if(process.argv.includes('--launches')) {
    await run('psql',[...args,'-f',fileURLToPath(new URL('./game-launch-db.sql',import.meta.url))])
    await run('psql',[...args,'-f',fileURLToPath(new URL('./game-launch-renewal-db.sql',import.meta.url))])
    const controlRace=await Promise.allSettled([
      run('psql',[...args,'-c',"set role service_role;select public.distribution_renew_launch('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',repeat('7',64),1800)"]),
      run('psql',[...args,'-c',"set role service_role;select public.distribution_revoke_launch('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',repeat('7',64))"]),
    ])
    assert.equal(controlRace[1].status,'fulfilled')
    const revoked=await run('psql',[...args,'-Atc',"select count(*) from public.game_launch_sessions where id='cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd' and revoked_at is not null"])
    assert.equal(revoked.stdout.trim(),'1')
    await assert.rejects(run('psql',[...args,'-c',"set role service_role;select public.distribution_renew_launch('cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',repeat('7',64),1800)"]))
    console.log('Renewal SQL passed: long access, fixed ceiling, private RPC, current permissions, expired/revoked refusal and renew/revoke race.')
    console.log('Launch SQL passed: anonymous published local, private RLS/RPCs, preview ownership/IDOR/revocation, hashed capabilities, bounded lifetime, atomic quotas, idempotent teardown and expiry cleanup.')
  }
  if(online){
    await run('psql',[...args,'-f',fileURLToPath(new URL('./online-session-db.sql',import.meta.url))])
    const query=id=>`set role service_role;select public.distribution_exchange_connection_ticket(repeat('a',64),repeat('5',64),'${id}')`
    const first='21212121-2121-4121-8121-212121212121',second='22222222-2222-4222-8222-222222222222'
    const races=await Promise.all([first,second].map(id=>run('psql',[...args,'-Atc',query(id)])))
    assert.equal(races.filter(r=>r.stdout.includes('"data"')).length,1)
    assert.equal(races.filter(r=>r.stdout.includes('ticket_replayed')).length,1)
    await run('psql',[...args,'-c',"delete from public.game_connection_tickets;set role service_role;select public.online_test_ticket('6')"])
    const same=await Promise.all([1,2].map(()=>run('psql',[...args,'-Atc',query(first).replace("repeat('5'","repeat('6'" )])))
    assert.equal(same.filter(r=>r.stdout.includes('"data"')).length,2)
    assert.equal(same[0].stdout,same[1].stdout)
    await run('psql',[...args,'-c',"set role service_role;select public.distribution_cleanup_online()"])
    console.log('Online SQL passed: RLS, FK/version/roster, opaque identity, START-only tickets, credential rotation/revocation, expiry, deployment/session/participant revocation, retry/replay and concurrent exchanges.')
  }
  if(multiplayer){
    await run('psql',[...args,'-f',fileURLToPath(new URL('./multiplayer-lobby-db.sql',import.meta.url))])
    await run('psql',[...args,'-f',fileURLToPath(new URL('../supabase/migrations/20261018000300_artifact_catalogue_and_server_roster.sql',import.meta.url))])
    await run('psql',[...args,'-f',fileURLToPath(new URL('./game-server-session-db.sql',import.meta.url))])
    if(process.argv.includes('--production-preflight')) {
      const report=await run('psql',[...args,'-f',fileURLToPath(new URL('../docs/sql/production-preflight.sql',import.meta.url))])
      assert.match(report.stdout,/read_only/)
      assert.match(report.stdout,/game_launch_lifetime_bounds/)
      console.log('Production preflight SQL executed in a read-only transaction against the disposable migrated schema.')
    }
    await import('./register.mjs')
    const {runMultiplayerTests}=await import('./multiplayer-db-runner.mjs')
    const query=async sql=>(await run('psql',[...args,'-qAtc',sql])).stdout.trim()
    if(pong){const {runPongMigration}=await import('./pong-migration.browser.mjs');await runPongMigration(query)}
    else await runMultiplayerTests(query)
  }
  await assert.rejects(run('psql',[...args,'-f',fileURLToPath(new URL('../supabase/migrations/20261016000100_game_distribution_versions.sql',import.meta.url))]))
  const race=await Promise.allSettled([
    run('psql',[...args,'-c',"set role service_role;select public.set_active_game_version('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444')"]),
    run('psql',[...args,'-c',"set role service_role;update public.game_versions set status='archived' where id='44444444-4444-4444-8444-444444444444'"]),
  ])
  assert.equal(race.filter(value=>value.status==='fulfilled').length,1)
  const check=await run('psql',[...args,'-Atc',"select count(*) from public.games g join public.game_versions v on v.id=g.active_version_id where v.game_id<>g.id or v.status<>'published'"])
  assert.equal(check.stdout.trim(),'0')
  if(multiplayer && process.argv.includes('--production-preflight')) {
    const manual=await readFile(new URL('../docs/production-activation.md',import.meta.url),'utf8')
    const template=manual.match(/```sql\n(\\set ON_ERROR_STOP on[\s\S]*?)\n```/)?.[1]
    assert.ok(template,'Publication template missing')
    const publication=join(directory,'publish-template.sql')
    await writeFile(publication,'set role service_role;\n'+template+'\n')
    const game='11111111-1111-4111-8111-111111111111',version='cececece-cece-4ece-8ece-cececececece'
    await run('psql',[...args,'-c',`set role service_role;
      insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
      select '${version}',game_id,'99.0.0-preflight',schema_version,integration_version,
      jsonb_set(manifest,'{version}','"99.0.0-preflight"'),artifact_sha256,artifact_size,file_count
      from public.game_versions where id='33333333-3333-4333-8333-333333333333';
      update public.game_versions set status='in_review' where id='${version}';
      update public.game_versions set status='approved' where id='${version}';`])
    const publish=buildVersion=>run('psql',[...args,'-v',`game_id=${game}`,'-v',`version_id=${version}`,'-v',`game_version=${buildVersion}`,'-f',publication])
    await assert.rejects(publish('wrong-version'),error=>error.code===3)
    const unchanged=await run('psql',[...args,'-Atc',`select status from public.game_versions where id='${version}'`])
    assert.equal(unchanged.stdout.trim(),'approved')
    await publish('99.0.0-preflight')
    const activated=await run('psql',[...args,'-Atc',`select v.status from public.games g join public.game_versions v on v.id=g.active_version_id where g.id='${game}' and v.id='${version}'`])
    assert.equal(activated.stdout.trim(),'published')
    await assert.rejects(publish('99.0.0-preflight'),error=>error.code===3)
    console.log('Runbook publication SQL passed: exact game/version/state assertions, atomic publish/pointer and repeat refusal, disposable data only.')
  }
  console.log('Disposable SQL passed: preserved catalogue, private RLS, immutable payload, lifecycle, same-game active pointer, rollback, archive/activation race and reapplication refusal.')
} finally { if(started)await run('pg_ctl',['-D',data,'-m','fast','-w','stop']) }

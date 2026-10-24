import assert from 'node:assert/strict'

export async function accountDeletionConcurrency(query){
 const admin='f1111111-1111-4111-8111-111111111111',actor='f2222222-2222-4222-8222-222222222222'
 await query(`insert into auth.users(id,email) values('${admin}','race-admin@example.test'),('${actor}','race-developer@example.test');insert into public.admin_users(user_id) values('${admin}')`)
 const game=(await query(`select public.distribution_register_game('${actor}',gen_random_uuid(),'Jeu concurrent')`)).trim()
 await query(`insert into public.game_versions(game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
 values('${game}','1.0.0',1,1,jsonb_build_object('gameId','${game}','version','1.0.0','schemaVersion',1,'integrationVersion',1),repeat('a',64),100,1);
 update public.game_versions set status='in_review' where game_id='${game}';update public.game_versions set status='approved' where game_id='${game}';
 update public.game_versions set status='published' where game_id='${game}';select public.set_active_game_version('${game}',(select id from public.game_versions where game_id='${game}'));
 update public.games set is_published=true where id='${game}'`)
 const job=JSON.parse(await query(`select public.distribution_account_request('${actor}','${actor}')`)).id
 await query(`select public.distribution_account_review('${admin}','${job}','fixture-concurrency-review')`)
 const claims=await Promise.all([1,2].map(()=>query(`select coalesce(public.distribution_account_claim('${job}'),'null'::jsonb)`)))
 const claimed=claims.map(JSON.parse).filter(Boolean);assert.equal(claimed.length,1)
 const lease=claimed[0].lease
 const payload={title:'Modification concurrente',slug:'account-deletion-race',game_type:'multiplayer_chibasko',game_url:null,multiplayer_game_id:game,is_published:true,is_beta:false,thumbnail_url:null}
 const results=await Promise.allSettled([
  query(`select public.admin_save_game('${admin}','${JSON.stringify(payload)}'::jsonb,'{}','${game}',null)`),
  query(`select public.distribution_account_prepare('${job}','${lease}')`),
 ])
 for(const result of results)if(result.status==='rejected')throw result.reason
 assert.equal((await query(`select title||':'||(active_version_id is not null)::text from public.games where id='${game}'`)).trim(),'Modification concurrente:true')
 assert.equal((await query(`select count(*) from public.game_platform_management where game_id='${game}' and authority_id='chibasko_games'`)).trim(),'1')
 assert.equal((await query(`select count(*) from public.game_developer_members where user_id='${actor}'`)).trim(),'0')
 // Une interruption expire le lease ; son ancien détenteur ne peut plus acquitter.
 await query(`update public.game_account_deletions set lease_until=now()-interval '1 second' where id='${job}'`)
 const resumed=JSON.parse(await query(`select public.distribution_account_claim('${job}')`))
 assert.notEqual(resumed.lease,lease)
 await assert.rejects(query(`select public.distribution_account_auth_deleted('${job}','${lease}')`),error=>/lease_lost/.test(error.stderr))
 await query(`delete from auth.users where id='${actor}';select public.distribution_account_auth_deleted('${job}','${resumed.lease}')`)
 await query(`select public.distribution_account_cleanup_ack('${job}','${resumed.lease}',id,null,true) from public.game_account_cleanup where job_id='${job}';select public.distribution_account_release('${job}','${resumed.lease}',null)`)
 assert.equal(JSON.parse(await query(`select public.distribution_account_status('${admin}','${job}')`)).state,'completed')
 await import('./register.mjs')
 const {processAccountDeletion}=await import('../lib/game-distribution/account-deletion.ts')
 const subject='f3333333-3333-4333-8333-333333333333'
 await query(`insert into auth.users(id,email) values('${subject}','auth-failure@example.test')`)
 const pending=JSON.parse(await query(`select public.distribution_account_request('${subject}','${subject}')`)).id
 const sqlValue=value=>value===null?'null':typeof value==='boolean'?String(value):"'"+String(value).replaceAll("'","''")+"'"
 const db={async call(name,args){
  assert.match(name,/^distribution_account_[a-z_]+$/)
  const raw=await query('select public.'+name+'('+Object.entries(args).map(([key,value])=>{assert.match(key,/^p_[a-z_]+$/);return key+'=>'+sqlValue(value)}).join(',')+')::text')
  if(!raw)return undefined
  try{return JSON.parse(raw)}catch{return raw}
 }}
 let fail=true
 const dependencies={db,auth:{async exists(id){return (await query(`select exists(select 1 from auth.users where id='${id}')`))==='t'},async remove(id){if(fail)throw Error('Panne Auth simulée');await query(`delete from auth.users where id='${id}'`)}},async cleanup(){return {done:true,cursor:null}}}
 assert.equal((await processAccountDeletion(dependencies,pending)).state,'prepared')
 assert.equal(await dependencies.auth.exists(subject),true)
 assert.equal((await query(`select count(*) from public.profiles where id='${subject}'`)).trim(),'0')
 fail=false
 await query(`select public.distribution_account_review('${admin}','${pending}',null)`)
 assert.equal((await processAccountDeletion(dependencies,pending)).state,'completed')
 assert.equal(await dependencies.auth.exists(subject),false)
 console.log('Suppression PostgreSQL : concurrence de claims, modification admin, transfert unique et reprise avec fencing validés.')
}

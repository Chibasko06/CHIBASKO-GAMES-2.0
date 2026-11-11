import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'

// Uniquement dans le cluster jetable, avec des comptes et versions synthétiques.
export async function publicOriginsIntegration(query){
 const owner=randomUUID(),version=randomUUID(),hash=()=>randomBytes(32).toString('hex')
 await query(`insert into auth.users(id,email) values('${owner}','origins-${owner}@example.test')`)
 const game=await query(`select distribution_register_game('${owner}','${randomUUID()}','Origines publiques')`)
 const manifest={schemaVersion:1,gameId:game,version:'1.0.0',integrationVersion:1,integration:{mode:'classic'},capabilities:{local:{players:{min:1,max:1}}},client:{entrypoints:{local:'index.html'}}}
 await query(`insert into game_versions(id,game_id,version,schema_version,integration_version,status,manifest,artifact_sha256,artifact_size,file_count)
 values('${version}','${game}','1.0.0',1,1,'draft','${JSON.stringify(manifest)}',repeat('a',64),100,2);
 update game_versions set status='in_review' where id='${version}';update game_versions set status='approved' where id='${version}';update game_versions set status='published' where id='${version}';update games set is_published=true where id='${game}'`)
 const rpc=async(name,args)=>JSON.parse(await query(`begin;set local role service_role;select coalesce(to_jsonb(public.${name}(${args.join(',')})),'null'::jsonb);commit;`))
 const q=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'"
 async function launch(v=version,actor=null){
  const capability=hash(),control=hash(),ticket=hash()
  const context={gameId:game,gameVersionId:v,execution:'local',locale:'fr',participants:[]}
  const s=await rpc('distribution_create_launch',[q(actor),q(game),q(v),"'published'","'local'",q(capability),q(control),q(JSON.stringify(context))+'::jsonb','900','120','10000'])
  await rpc('distribution_issue_public_delivery',[q(s.id),q(control),q(ticket)])
  await assert.rejects(rpc('distribution_check_launch',[q(capability)]),e=>/launch_expired/.test(e.stderr))
  return {...s,control,ticket}
 }
 const exchange=(s,c=hash(),g=game)=>rpc('distribution_exchange_public_delivery',[q(g),q(s.ticket),q(c)])
 const shared=(s,c,previous=null)=>rpc('distribution_exchange_shared_public_delivery',[q(game),q(s.ticket),q(c),q(previous)])
 const s=await launch(),cookie=hash()
 await assert.rejects(exchange(s,hash(),randomUUID()),e=>/launch_expired/.test(e.stderr))
 const raced=await Promise.allSettled([exchange(s,cookie),exchange(s,cookie)])
 assert.equal(raced.filter(r=>r.status==='fulfilled').length,1)
 assert.match(raced.find(r=>r.status==='rejected').reason.stderr,/ticket_replayed/)
 assert.equal((await rpc('distribution_check_public_delivery',[q(game),q(cookie)])).id,s.id)
 const second=await launch(),secondCookie=hash()
 assert.equal((await shared(second,secondCookie,cookie)).delivery_cookie_reused,true)
 assert.equal((await rpc('distribution_check_public_delivery',[q(game),q(cookie)])).id,second.id)
 await assert.rejects(rpc('distribution_check_public_delivery',[q(game),q(secondCookie)]),e=>/launch_expired/.test(e.stderr))
 await rpc('distribution_revoke_launch',[q(second.id),q(second.control)])
 assert.equal((await rpc('distribution_check_public_delivery',[q(game),q(cookie)])).id,s.id,'La fermeture du second lecteur conserve le premier')
 const third=await launch();await shared(third,hash(),cookie)
 await query(`update game_launch_sessions set created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where id='${third.id}'`)
 assert.equal((await rpc('distribution_check_public_delivery',[q(game),q(cookie)])).id,s.id,'Une session expirée ne masque pas une session encore active')
 const fourth=await launch(),fifth=await launch()
 const grouped=await Promise.all([shared(fourth,hash(),cookie),shared(fifth,hash(),cookie)])
 assert.ok(grouped.every(r=>r.delivery_cookie_reused===true))
 await assert.rejects(exchange(fourth),e=>/ticket_replayed/.test(e.stderr))
 await rpc('distribution_revoke_launch',[q(fourth.id),q(fourth.control)]);await rpc('distribution_revoke_launch',[q(fifth.id),q(fifth.control)])
 assert.equal((await rpc('distribution_check_public_delivery',[q(game),q(cookie)])).id,s.id)
 await assert.rejects(rpc('distribution_check_public_delivery',[q(randomUUID()),q(cookie)]),e=>/launch_expired/.test(e.stderr))
 const expired=await launch();await query(`update game_public_deliveries set ticket_expires_at=now()-interval '1 second' where launch_id='${expired.id}'`)
 await assert.rejects(exchange(expired),e=>/launch_expired/.test(e.stderr))
 await query(`update games set is_published=false where id='${game}'`)
 await assert.rejects(rpc('distribution_check_public_delivery',[q(game),q(cookie)]),e=>/version_not_found/.test(e.stderr))
 await query(`update games set is_published=true where id='${game}'`)
 const next=randomUUID()
 await query(`insert into game_versions(id,game_id,version,schema_version,integration_version,status,manifest,artifact_sha256,artifact_size,file_count)
 select '${next}',game_id,'9.9.9',schema_version,integration_version,'draft',jsonb_set(manifest,'{version}','"9.9.9"'),artifact_sha256,artifact_size,file_count from game_versions where id='${version}';
 update game_versions set status='in_review' where id='${next}';update game_versions set status='approved' where id='${next}';update game_versions set status='published' where id='${next}'`)
 const newer=await launch(next)
 await assert.rejects(shared(newer,hash(),cookie),e=>/delivery_version_conflict/.test(e.stderr))
 await assert.rejects(exchange(newer),e=>/delivery_version_conflict/.test(e.stderr))
 await rpc('distribution_revoke_launch',[q(s.id),q(s.control)])
 await assert.rejects(rpc('distribution_check_public_delivery',[q(game),q(cookie)]),e=>/launch_expired/.test(e.stderr))
 assert.equal((await exchange(newer)).version_id,next)
 const old=await launch()
 await assert.rejects(exchange(old),e=>/delivery_version_conflict/.test(e.stderr))
 for(const role of ['anon','authenticated']){
  await assert.rejects(query(`set role ${role};select * from game_public_deliveries`),e=>/permission/i.test(e.stderr))
  for(const signature of ['distribution_issue_public_delivery(uuid,text,text)','distribution_check_public_delivery(uuid,text)','distribution_exchange_public_delivery(uuid,text,text,text)','distribution_exchange_shared_public_delivery(uuid,text,text,text)','distribution_check_versioned_public_delivery(uuid,uuid,text)','distribution_exchange_versioned_public_delivery(uuid,text,text,text)'])assert.equal(await query(`select has_function_privilege('${role}','public.${signature}','execute')`),'f')
  await assert.rejects(query(`set role ${role};select distribution_check_versioned_public_delivery(null,null,null)`),e=>/permission/i.test(e.stderr))
  await assert.rejects(query(`set role ${role};select distribution_exchange_versioned_public_delivery(null,null,null,null)`),e=>/permission/i.test(e.stderr))
 }
 assert.equal(await query("select count(*) from pg_proc where proname in ('distribution_issue_public_delivery','distribution_check_public_delivery','distribution_exchange_public_delivery','distribution_exchange_shared_public_delivery','distribution_check_versioned_public_delivery','distribution_exchange_versioned_public_delivery') and prosecdef"),'0')
 await query(`delete from game_launch_sessions where id='${newer.id}'`)
 assert.equal(await query(`select count(*) from game_public_deliveries where launch_id='${newer.id}'`),'0')
 const concurrent=await launch(next),aCookie=hash(),bCookie=hash()
 const versions=await Promise.allSettled([exchange(old,aCookie),exchange(concurrent,bCookie)])
 assert.equal(versions.filter(r=>r.status==='fulfilled').length,1,'Deux premiers échanges concurrents ne peuvent pas servir des versions différentes')
 assert.match(versions.find(r=>r.status==='rejected').reason.stderr,/delivery_version_conflict/)
 const winningCookie=versions[0].status==='fulfilled'?aCookie:bCookie
 await query(`update game_launch_sessions set created_at=now()-interval '1 hour',expires_at=now()-interval '1 second' where version_id in ('${version}','${next}')`)
 await assert.rejects(rpc('distribution_check_public_delivery',[q(game),q(winningCookie)]),e=>/launch_expired/.test(e.stderr))
 const authenticated=await launch(version,owner),ownerCookie=hash();await exchange(authenticated,ownerCookie)
 const admin=randomUUID();await query(`insert into auth.users(id,email) values('${admin}','origins-admin-${admin}@example.test');insert into admin_users(user_id) values('${admin}')`)
 const decision={kind:'player',target:owner,action:'ban',operationId:randomUUID(),version:0,reason:'Restriction de la fixture apres ouverture du lecteur.',note:'',retentionDays:30,factsKey:randomUUID(),factsSummary:'Faits de test distincts pour verifier la revocation de livraison.'}
 await rpc('distribution_moderation_measure',[q(admin),q(JSON.stringify(decision))+'::jsonb'])
 await assert.rejects(rpc('distribution_check_public_delivery',[q(game),q(ownerCookie)]),e=>/account_restricted|launch_expired/.test(e.stderr))
 await assert.rejects(rpc('distribution_check_versioned_public_delivery',[q(game),q(version),q(ownerCookie)]),e=>/account_restricted|launch_expired/.test(e.stderr))
 console.log('Public origins SQL PASS : droits minimaux, ancien accès invalidé, ticket unique concurrent, expiration, jeu caché, révocation, cloisonnement par jeu, conflit de versions et nettoyage en cascade.')
}

import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
export async function moderationIntegration(query){
 const actor='fa500000-0000-4000-8000-000000000001',target='fa500000-0000-4000-8000-000000000002',admin='fa500000-0000-4000-8000-000000000003',game=randomUUID()
 await query(`insert into auth.users(id,email,raw_user_meta_data) values('${actor}','mod-a@example.test','{"username":"mod-alpha"}'),('${target}','mod-b@example.test','{"username":"mod-beta"}'),('${admin}','mod-admin@example.test','{"username":"mod-admin"}');insert into public.admin_users(user_id) values('${admin}');insert into public.games(id,title,slug,game_url,is_published) values('${game}','Moderation','moderation-fixture','https://example.test/game',true);insert into public.social_blocks(blocker,blocked) values('${actor}','${target}')`)
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 const body={operationId:randomUUID(),kind:'player',target,category:'harassment',description:'Description factuelle du signalement pour la fixture.',contactName:'',contactEmail:'',goodFaith:false,sensitiveException:false}
 const send=(value=body,who=actor,client='a'.repeat(64),fingerprint='b'.repeat(64))=>query(`set role service_role;select public.distribution_moderation_submit(${who?"'"+who+"'":'null'},${literal(value)},'${client}','${fingerprint}')`).then(JSON.parse)
 const saved=await Promise.all([send(),send()]);assert.equal(saved[0].id,saved[1].id);assert.deepEqual(saved.map(item=>item.replayed).sort(),[false,true]);const id=saved[0].id
 assert.equal(await query(`select count(*) from public.moderation_mail where case_id='${id}'`),'1')
 assert.equal(await query(`select is_published from public.games where id='${game}'`),'t')
 for(const role of ['anon','authenticated']){
  for(const table of ['moderation_cases','moderation_events','moderation_receipts','moderation_mail'])assert.equal(await query(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE')`),'f')
  await assert.rejects(query(`set role ${role};select public.distribution_moderation_submit(null,'{}',repeat('a',64),repeat('b',64))`))
 }
 await assert.rejects(send({...body,operationId:randomUUID(),target:actor},actor),error=>/invalid_request/.test(error.stderr))
 await assert.rejects(query(`select public.distribution_moderation_admin('${actor}','{}')`),error=>/forbidden/.test(error.stderr))
 await query(`insert into public.social_blocks(blocker,blocked) values('${admin}','${target}')`)
 assert.equal(JSON.parse(await query(`select public.distribution_moderation_admin('${admin}','{"id":"${id}"}')`)).target_view.username,'mod-beta')
 const update={action:'update',id,version:1,state:'resolved',justification:'Examen termine sans action automatique.',note:'Note reservee aux administrateurs.',retentionDays:90,privacyReviewed:false}
 const changes=await Promise.allSettled([0,1].map(()=>query(`select public.distribution_moderation_admin('${admin}',${literal(update)})`)))
 assert.equal(changes.filter(item=>item.status==='fulfilled').length,1);assert.match(changes.find(item=>item.status==='rejected').reason.stderr,/idempotency_conflict/)
 assert.equal(await query(`select count(*) from public.moderation_events where case_id='${id}'`),'2')
 await query(`select public.distribution_moderation_admin('${admin}',${literal({...update,version:2,state:'review',justification:'',redactedDescription:'Description minimisee sans donnees personnelles inutiles.',redactNotes:true,note:'Minimisation des textes pour proteger les personnes.'})})`)
 assert.equal(await query(`select count(*) from public.moderation_events where case_id='${id}' and version<3 and (note is not null or justification is not null)`),'0')
 assert.equal(await query(`select redacted and actor_reference='${admin}'::uuid from public.moderation_events where case_id='${id}' and version=3`),'t')
 for(let i=0;i<20;i++)await send({...body,operationId:randomUUID(),description:'Description de quota numero '+i+' pour la fixture.'},actor,'1'.repeat(64),(i+1).toString(16).padStart(64,'0'))
 await assert.rejects(send({...body,operationId:randomUUID()},actor,'1'.repeat(64),'2'.repeat(64)),error=>/rate_limited/.test(error.stderr))
 await send({...body,operationId:randomUUID(),category:'illegal',goodFaith:true,contactName:'Fixture',contactEmail:'legal@example.test'},actor,'1'.repeat(64),'3'.repeat(64))
 const guest=await send({...body,operationId:randomUUID(),category:'illegal',goodFaith:true,contactName:'Fixture',contactEmail:'guest@example.test'},null,'c'.repeat(64),'d'.repeat(64))
 assert.equal(await query(`select count(*) from public.moderation_mail where case_id='${guest.id}'`),'2')
 const exceptional=await send({...body,operationId:randomUUID(),category:'illegal',goodFaith:true,sensitiveException:true},null,'e'.repeat(64),'f'.repeat(64))
 assert.equal(await query(`select count(*) from public.moderation_mail where case_id='${exceptional.id}'`),'1')
 const legalUpdate={...update,id:guest.id}
 await query(`select public.distribution_moderation_admin('${admin}',${literal(legalUpdate)})`)
 assert.equal(await query(`select count(*) from public.moderation_mail where case_id='${guest.id}' and kind='decision'`),'1')
 const claims=await Promise.all([0,1].map(()=>query('set role service_role;select public.distribution_moderation_claim_mail()').then(JSON.parse)))
 assert.notEqual(claims[0].id,claims[1].id)
 const job=claims[0];await query(`update public.moderation_mail set next_attempt_at=now()+interval '1 day' where id<>'${job.id}';update public.moderation_mail set lease_until=now()-interval '1 second' where id='${job.id}'`)
 const replacement=JSON.parse(await query('select public.distribution_moderation_claim_mail()'))
 assert.equal(replacement.id,job.id);assert.notEqual(replacement.lease,job.lease)
 await assert.rejects(query(`select public.distribution_moderation_finish_mail('${job.id}','${job.lease}',true)`),error=>/lease_lost/.test(error.stderr))
 await query(`select public.distribution_moderation_prepare_mail('${job.id}','${replacement.lease}','{"text":"fixture"}');select public.distribution_moderation_finish_mail('${job.id}','${replacement.lease}',false)`)
 assert.equal(await query(`select next_attempt_at>now() from public.moderation_mail where id='${job.id}'`),'t')
 await query(`update public.moderation_mail set lease_until=null,first_attempt_at=now()-interval '23 hours' where state='pending';select public.distribution_moderation_claim_mail()`)
 assert.equal(await query(`select count(*) from public.moderation_mail where state='pending'`),'0')
 const {moderationApiIntegration}=await import('./moderation-api-db.mjs')
 await moderationApiIntegration(query,{actor,target,admin})
 const jobId=JSON.parse(await query(`select public.distribution_account_request('${actor}','${actor}')`)).id
 const deletion=JSON.parse(await query(`select public.distribution_account_claim('${jobId}')`))
 await query(`select public.distribution_account_prepare('${jobId}','${deletion.lease}')`)
 assert.equal(await query(`select reporter is null and contact_email is null and privacy_review from public.moderation_cases where id='${id}'`),'t')
 await query(`delete from public.profiles where id='${target}'`)
 assert.equal(await query(`select target_user is null and target_locator='/players/compte-supprime' from public.moderation_cases where id='${id}'`),'t')
 assert.equal(await query(`select count(*) from public.moderation_cases where id='${id}'`),'1')
 await query(`select public.distribution_moderation_admin('${admin}',${literal({...update,version:3,privacyReviewed:true})})`)
 await query(`update public.moderation_cases set closed_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id='${id}'`)
 assert.equal(await query('set role service_role;select public.distribution_moderation_cleanup()'),'1')
 assert.equal(await query(`select count(*) from public.moderation_events where case_id='${id}'`),'0')
 console.log('Moderation PostgreSQL : RLS, blocages, invites, concurrence, audit, outbox, leases, backoff et suppression de compte valides.')
}

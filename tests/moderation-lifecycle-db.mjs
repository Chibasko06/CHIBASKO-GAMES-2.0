import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export async function moderationLifecycleIntegration(query){
 const admin=randomUUID(),secondAdmin=randomUUID(),player=randomUUID(),other=randomUUID(),third=randomUUID(),game=randomUUID()
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 const seed=async(id,username='member-'+id.slice(0,12))=>query(`insert into auth.users(id,email,raw_user_meta_data) values('${id}','${id}@example.test','{"username":"${username}"}')`)
 await seed(admin,'moderation-operator');await seed(secondAdmin,'moderation-admin-two');await seed(player,'test');await seed(other,'joker');await seed(third)
 await query(`insert into admin_users(user_id) values('${admin}'),('${secondAdmin}');insert into games(id,title,slug,game_url,is_published) values('${game}','Moderation courante','moderation-${game}','https://example.test/game',true)`)
 const body=(target=player,extra={})=>{const op=randomUUID();return {factsKey:op,factsSummary:'Faits distincts de la fixture : '+op,kind:'player',target,action:'warn',version:0,operationId:op,reason:'Decision administrative fondee sur des faits verifies.',note:'Note privee.',retentionDays:30,...extra}}
 const decide=async(input,actor=admin)=>JSON.parse(await query(`set role service_role;select public.distribution_moderation_measure('${actor}',${literal(input)})`))
 assert.equal(await query("select to_regclass('public.moderation_measure_scope') is null and to_regclass('public.moderation_qualification_targets') is null"),'t')
 assert.equal(await query(`select username from profiles where id='${player}'`),'test')
 assert.equal(await query(`select username from profiles where id='${other}'`),'joker')
 await assert.rejects(decide(body(player,{kind:'game'})),error=>/game_not_found/.test(error.stderr))
 await assert.rejects(decide(body(admin)),error=>/forbidden/.test(error.stderr))
 await assert.rejects(decide(body(secondAdmin)),error=>/forbidden/.test(error.stderr))
 await assert.rejects(decide(body(),other),error=>/forbidden/.test(error.stderr))
 assert.equal(await query(`select count(*) from moderation_measure_mail where recipient in('${admin}','${secondAdmin}')`),'0')
 const original=body(),warned=await decide(original)
 assert.equal(warned.version,1);assert.equal((await decide(original)).id,warned.id)
 assert.equal((await decide(body(other))).version,1)
 assert.equal((await decide(body(third))).version,1,'Un compte quelconque est eligible sans inscription sur une liste')
 for(const role of ['anon','authenticated','service_role'])await assert.rejects(query(`set role ${role};select public.moderation_measure_apply('${admin}',${literal(body(other))})`))
 for(const role of ['anon','authenticated']){
  await assert.rejects(query(`set role ${role};select public.distribution_moderation_measure('${admin}',${literal(body())})`))
  await assert.rejects(query(`set role ${role};select * from moderation_measures`))
 }
 const concurrent=await Promise.allSettled([0,1].map(()=>decide(body(player,{version:1}))))
 assert.equal(concurrent.filter(item=>item.status==='fulfilled').length,1)
 const suspension=await decide(body(player,{version:2,action:'suspend',endsAt:new Date(Date.now()+3600000).toISOString(),retentionDays:365}))
 const retained=await query(`select retain_until from moderation_subjects where user_id='${player}'`)
 assert.equal((await decide(original)).id,warned.id)
 await assert.rejects(query(`set role authenticated;set request.jwt.claim.sub='${player}';insert into favorites(user_id,game_id) values('${player}','${game}')`))
 assert.equal(await query(`set role service_role;select public.distribution_account_access('${player}')`),'f')
 const appeal=randomUUID()
 await query(`set role authenticated;set request.jwt.claim.sub='${player}';select public.moderation_appeal('${appeal}','${suspension.id}','Les faits contestes doivent etre reexamines.')`)
 await query(`set role service_role;select public.distribution_moderation_appeals('${admin}',${literal({id:appeal,version:1,state:'accepted',decision:'La levee de cette suspension est explicitement approuvee.',lift:true,subjectVersion:3,operationId:randomUUID()})})`)
 assert.equal(await query(`select retain_until>='${retained}'::timestamptz from moderation_subjects where user_id='${player}'`),'t')
 assert.equal(await query(`set role service_role;select public.distribution_account_access('${player}')`),'t')
 const removal=await decide(body(game,{kind:'game',action:'unpublish'}))
 await decide(body(game,{kind:'game',action:'restore',version:removal.version}))
 assert.equal(await query(`select is_published from games where id='${game}'`),'t')
 await query("update moderation_subjects set retain_until=now()+interval '10 years'")

 // Les fixtures de conservation utilisent des dates anciennes, sans attendre le calendrier.
 const fixture=async({hold=null,archived=false,mails=0}={})=>{
  const user=randomUUID(),subject=randomUUID(),measure=randomUUID();await seed(user)
  await query(`insert into moderation_subjects(id,kind,user_id,version,retention_days,retain_until,measure) values('${subject}','player','${user}',1,30,now()-interval '2 days',${hold==='ban'?"'ban'":'null'});
   insert into moderation_measures(id,subject,actor,actor_reference,operation_hash,version,action,reason,note,retention_days,archived_at) values('${measure}','${subject}','${admin}','${admin}',repeat('a',64),1,'warn','Justification a conserver puis a expurger.','Note privee a expurger.',30,${archived?'now()':'null'});
   update moderation_measure_mail set state='sent' where measure_id='${measure}'`)
  if(hold==='appeal')await query(`insert into moderation_appeals(id,measure,author,description) values('${randomUUID()}','${measure}','${user}','Un recours attend toujours son reexamen.')`)
  if(hold==='mail')await query(`update moderation_measure_mail set state='attention_required' where measure_id='${measure}'`)
  if(mails)await query(`insert into moderation_measure_mail(measure_id,kind,version,state,notice,message)
   select '${measure}','receipt',n,'sent','{"text":"Donnees de fixture a expurger"}','{"text":"Message de fixture a expurger"}' from generate_series(1,${mails}) n`)
  return {user,subject,measure}
 }
 const held=[];for(let i=0;i<10;i++)held.push(await fixture({hold:i<5?'appeal':'mail'}))
 const eligible=await fixture()
 // Les dix retenues precedent volontairement la cible eligible dans l'index.
 await query(`update moderation_subjects set retain_until=now()-interval '1 day' where id='${eligible.subject}'`)
 await query('set role service_role;select distribution_moderation_archive()')
 assert.equal(await query(`select archived_at is not null from moderation_measures where id='${eligible.measure}'`),'t')
 for(const item of held)assert.equal(await query(`select archived_at is null from moderation_measures where id='${item.measure}'`),'t')
 const blocked=await fixture({hold:'ban'});await query('set role service_role;select distribution_moderation_archive()')
 assert.equal(await query(`select archived_at is null from moderation_measures where id='${blocked.measure}'`),'t')
 const payload=await fixture({archived:true,mails:250})
 const remaining=()=>query(`select count(*) from moderation_measure_mail where measure_id='${payload.measure}' and (message is not null or notice<>'{}')`)
 assert.equal(await remaining(),'251')
 await assert.rejects(query("begin;set role service_role;select distribution_moderation_archive();select 1/0;commit"))
 assert.equal(await remaining(),'251','Une interruption transactionnelle conserve un lot reprenable')
 await query('set role service_role;select distribution_moderation_archive()')
 assert.equal(await remaining(),'151','Chaque passage traite au plus cent messages par cible')
 await Promise.all([0,1].map(()=>query('set role service_role;select distribution_moderation_archive()')))
 await query('set role service_role;select distribution_moderation_archive()')
 assert.equal(await remaining(),'0','Les messages de decisions deja archivees sont tous repris')
 assert.equal(await query(`select actor_reference='${admin}' and subject='${payload.subject}' from moderation_measures where id='${payload.measure}'`),'t','L’expurgation ne constitue pas une anonymisation complete')
 await query('set role service_role;select distribution_moderation_archive();select distribution_moderation_archive()')
 assert.equal(await remaining(),'0')
 console.log('Moderation courante : comptes ordinaires, protections administrateur, recours, concurrence, conservation et reprise des gros lots verifies.')
}

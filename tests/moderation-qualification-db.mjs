import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export async function moderationQualificationIntegration(query){
 const admin=randomUUID(),player=randomUUID(),other=randomUUID(),game=randomUUID()
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 const seed=async id=>query(`insert into auth.users(id,email,raw_user_meta_data) values('${id}','${id}@example.test','{"username":"qual-${id.slice(0,12)}"}')`)
 for(const id of [admin,player,other])await seed(id)
 await query(`insert into admin_users(user_id) values('${admin}');insert into games(id,title,slug,game_url,is_published) values('${game}','Qualification','qualification-${game}','https://example.test/game',true)`)
 const body=(target=player,extra={})=>({kind:'player',target,action:'warn',version:0,operationId:randomUUID(),reason:'Qualification autorisee de ressources de test.',note:'Note privee de qualification.',retentionDays:30,...extra})
 const decide=async input=>JSON.parse(await query(`set role service_role;select public.distribution_moderation_measure('${admin}',${literal(input)})`))
 const fails=(input,message)=>assert.rejects(decide(input),error=>error.stderr?.includes(message))
 const original=body()
 await fails(original,'moderation_scope_disabled')
 await query('delete from moderation_measure_scope')
 await fails(original,'moderation_scope_disabled')
 await query("insert into moderation_measure_scope values(true,'qualification')")
 await assert.rejects(query("update moderation_measure_scope set mode='incorrect'"))
 await fails(original,'moderation_target_not_allowed')
 await assert.rejects(query(`insert into moderation_qualification_targets(game_id) values('${player}')`),'Le type de cible est garanti par la cle etrangere')
 await assert.rejects(query(`insert into moderation_qualification_targets(user_id) values('${randomUUID()}')`))
 await query(`insert into moderation_qualification_targets(user_id) values('${player}'),('${admin}');insert into moderation_qualification_targets(game_id) values('${game}')`)
 await fails(body(other),'moderation_target_not_allowed')
 await fails(body(player,{kind:'game'}),'game_not_found')
 await fails(body(admin),'forbidden')
 assert.equal(await query(`select count(*) from moderation_measures m join moderation_subjects s on s.id=m.subject where s.user_id in('${player}','${other}','${admin}')`),'0')
 assert.equal(await query(`select count(*) from moderation_measure_mail where recipient in('${player}','${other}','${admin}')`),'0','Une mesure refusee ne cree aucun e-mail')
 const warned=await decide(original);assert.equal(warned.version,1)
 assert.equal((await decide(original)).id,warned.id)
 for(const role of ['anon','authenticated','service_role']){
  await assert.rejects(query(`set role ${role};select * from moderation_measure_scope`))
  await assert.rejects(query(`set role ${role};update moderation_measure_scope set mode='general'`))
  await assert.rejects(query(`set role ${role};insert into moderation_qualification_targets(user_id) values('${other}')`))
  await assert.rejects(query(`set role ${role};select public.moderation_measure_apply('${admin}',${literal(body(other))})`))
 }
 for(const role of ['anon','authenticated'])await assert.rejects(query(`set role ${role};select public.distribution_moderation_measure('${admin}',${literal(body())})`))
 const concurrent=await Promise.allSettled([0,1].map(()=>decide(body(player,{version:1}))))
 assert.equal(concurrent.filter(item=>item.status==='fulfilled').length,1)
 const suspension=await decide(body(player,{version:2,action:'suspend',endsAt:new Date(Date.now()+3600000).toISOString(),retentionDays:365}))
 const retained=await query(`select retain_until from moderation_subjects where user_id='${player}'`)
 await query("update moderation_measure_scope set mode='disabled'")
 assert.equal((await decide(original)).id,warned.id,'Une relecture idempotente reste possible apres fermeture')
 await assert.rejects(query(`set role authenticated;set request.jwt.claim.sub='${player}';insert into favorites(user_id,game_id) values('${player}','${game}')`))
 assert.equal(await query(`set role service_role;select public.distribution_account_access('${player}')`),'f')
 const appeal=randomUUID()
 await query(`set role authenticated;set request.jwt.claim.sub='${player}';select public.moderation_appeal('${appeal}','${suspension.id}','Les faits de qualification doivent etre reexamines.')`)
 await query(`set role service_role;select public.distribution_moderation_appeals('${admin}',${literal({id:appeal,version:1,state:'accepted',decision:'La levee de cette suspension de test est approuvee.',lift:true,subjectVersion:3,operationId:randomUUID()})})`)
 assert.equal(await query(`select retain_until>='${retained}'::timestamptz from moderation_subjects where user_id='${player}'`),'t')
 assert.equal(await query(`set role service_role;select public.distribution_account_access('${player}')`),'t')
 await query("update moderation_measure_scope set mode='qualification'")
 const marker='qualification-lock-'+randomUUID()
 const holding=query(`begin;set role service_role;select public.distribution_moderation_measure('${admin}',${literal(body(player,{version:4}))});select pg_sleep(3) /* ${marker} */;commit`)
 try{
  const deadline=Date.now()+10000;let sleeping=false
  while(Date.now()<deadline){
   sleeping=(await query(`select exists(select 1 from pg_stat_activity where query like '%${marker}%' and wait_event='PgSleep')`))==='t'
   if(sleeping)break
   await new Promise(resolve=>setTimeout(resolve,20))
  }
  assert.equal(sleeping,true,'La transaction conserve le verrou apres la decision')
  await assert.rejects(query("set lock_timeout='50ms';update moderation_measure_scope set mode='disabled'"),error=>/lock timeout/.test(error.stderr))
 }finally{await holding}
 const removal=await decide(body(game,{kind:'game',action:'unpublish'}))
 await query('delete from moderation_measure_scope')
 await decide(body(game,{kind:'game',action:'restore',version:removal.version}))
 assert.equal(await query(`select is_published from games where id='${game}'`),'t','Une restauration ne depend pas du perimetre de creation')
 await query("insert into moderation_measure_scope values(true,'general')")
 await decide(body(other))
 await query("update moderation_measure_scope set mode='disabled';update moderation_subjects set retain_until=now()+interval '10 years'")

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
 console.log('Qualification PostgreSQL : perimetre prive, refus sans e-mail, recuperation, JWT, concurrence, conservation et reprise des gros lots verifies.')
}

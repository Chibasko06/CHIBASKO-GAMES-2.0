import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export async function moderationFactsIntegration(query){
 const admin=randomUUID(),player=randomUUID(),other=randomUUID(),report=randomUUID()
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 const call=async(name,input,actor=admin)=>JSON.parse(await query(`set role service_role;select public.${name}('${actor}',${literal(input)})`))
 await query(`insert into auth.users(id,email,raw_user_meta_data) values('${admin}','${admin}@example.test','{"username":"facts-admin"}'),('${player}','${player}@example.test','{"username":"facts-player"}'),('${other}','${other}@example.test','{"username":"facts-other"}');insert into admin_users(user_id) values('${admin}');update moderation_measure_scope set mode='general';insert into moderation_cases(id,target_kind,target_user,target_locator,category,description) values('${report}','player','${player}','facts-player','spam','Messages repetes dans le cadre du premier incident verifie.')`)
 const decide=input=>call('distribution_moderation_measure',{kind:'player',target:player,operationId:randomUUID(),action:'warn',version:0,reason:'Motif communicable de la decision administrative.',note:'Note privee jamais publique.',retentionDays:30,...input})
 const warn=await decide({caseId:report}),fact=warn.current.history[0].facts
 assert.equal(fact.revision,1)
 const appeal=randomUUID()
 await query(`set role authenticated;set request.jwt.claim.sub='${player}';select public.moderation_appeal('${appeal}','${warn.id}','Les faits contestes ne justifient pas cet avertissement.')`)
 const review={id:appeal,version:1,state:'accepted',decision:'Les elements sont insuffisants ; recours accepte sans effet automatique.',effect:'none',lift:false,operationId:randomUUID(),subjectVersion:1}
 await call('distribution_moderation_appeals',review)
 await call('distribution_moderation_appeals',review)
 assert.equal(await query(`select state from moderation_facts where id='${fact.id}'`),'closed')
 assert.equal(await query(`select count(*) from moderation_warning_withdrawals where measure_id='${warn.id}'`),'0')
 const emails=await query(`select count(*) from moderation_measure_mail`)
 await assert.rejects(decide({caseId:report,version:1}),error=>/facts_closed/.test(error.stderr))
 assert.equal(await query('select count(*) from moderation_measure_mail'),emails)
 // Un nouvel incident n’est pas interdit par l’acceptation du recours precedent.
 const next=await decide({version:1,factsKey:'incident-distinct-2',factsSummary:'Autre incident constate a une date et dans un contexte distincts.'})
 assert.notEqual(next.current.history[0].facts.id,fact.id)
 await assert.rejects(decide({version:2,factsKey:'autre-reference',factsSummary:'AUTRE INCIDENT constate a une date et dans un contexte distincts.'}),error=>/facts_conflict/.test(error.stderr))
 await query(`update moderation_cases set state='resolved',justification='Dossier clos apres examen des elements presentes.',closed_at=now(),expires_at=now()+interval '30 days',version=version+1 where id='${report}'`)
 await assert.rejects(decide({version:2,factId:fact.id,factsRevision:1}),error=>/facts_closed/.test(error.stderr))
 const reopen={action:'reopen',id:fact.id,revision:1,operationId:randomUUID(),reason:'Nouvelle preuve verifiee justifiant explicitement un reexamen.'}
 const concurrent=await Promise.all([call('distribution_moderation_facts',reopen),call('distribution_moderation_facts',reopen)])
 assert.equal(concurrent.length,2)
 assert.equal(await query(`select revision from moderation_facts where id='${fact.id}'`),'2')
 const revised=await decide({version:2,caseId:report,factId:fact.id,factsRevision:2})
 await assert.rejects(decide({version:3,caseId:report,factId:fact.id,factsRevision:2}),error=>/facts_already_decided/.test(error.stderr))
 // Retirer un avertissement ne doit pas lever une restriction fondee sur d’autres faits.
 const ban=await decide({version:3,action:'ban',factsKey:'incident-distinct-3',factsSummary:'Faits graves distincts etablis apres le premier recours accepte.'})
 assert.equal(ban.current.blocked,true)
 const withdrawal={measureId:warn.id,operationId:randomUUID(),version:4,reason:'Retrait explicite de cet avertissement apres verification du recours.'}
 await Promise.all([call('distribution_moderation_warning_withdraw',withdrawal),call('distribution_moderation_warning_withdraw',withdrawal)])
 assert.equal(await query(`select version from moderation_subjects where user_id='${player}'`),'5')
 const own=JSON.parse(await query(`set role authenticated;set request.jwt.claim.sub='${player}';select public.moderation_self_status()`))
 assert.equal(own.blocked,true)
 assert.ok(own.history.find(item=>item.id===warn.id).withdrawal)
 assert.equal(own.history.find(item=>item.id===warn.id).appeal.effect,'none')
 assert.doesNotMatch(JSON.stringify(own),/Note privee|factsKey|fingerprint|actor_reference/)
 const summary=await call('distribution_moderation_browse',{view:'measures',id:warn.id})
 assert.equal(summary.state,'withdrawn')
 assert.ok(summary.facts.events.some(event=>event.action==='reopened'))
 await assert.rejects(call('distribution_moderation_facts',{kind:'player',target:player},other),error=>/forbidden/.test(error.stderr))
 await assert.rejects(decide({target:admin,version:0,factsKey:'admin-protege',factsSummary:'Tentative interdite visant un compte administratif protege.'}),error=>/forbidden/.test(error.stderr))
 for(const role of ['anon','authenticated']){
  for(const table of ['moderation_facts','moderation_fact_events','moderation_warning_withdrawals'])await assert.rejects(query(`set role ${role};select * from ${table}`))
  for(const rpc of ['distribution_moderation_facts','distribution_moderation_warning_withdraw'])await assert.rejects(query(`set role ${role};select public.${rpc}('${admin}','{}')`))
 }
 await query("update moderation_measure_scope set mode='disabled'")
 const lifted=await decide({action:'lift',version:5})
 assert.equal(lifted.current.blocked,false)
 const correction={measureId:revised.id,operationId:randomUUID(),version:6,reason:'Correction explicite possible meme lorsque la creation est desactivee.'}
 await call('distribution_moderation_warning_withdraw',correction)
 assert.equal(await query(`select count(*) from moderation_measure_mail where measure_id='${revised.id}' and kind='correction'`),'1')
 const secondAppeal=randomUUID()
 await query(`set role authenticated;set request.jwt.claim.sub='${player}';select moderation_appeal('${secondAppeal}','${next.id}','Cet avertissement distinct doit etre retire apres reexamen.')`)
 const explicit={id:secondAppeal,version:1,state:'accepted',decision:'Avertissement injustifie ; retrait explicitement decide.',effect:'withdraw_warning',lift:false,subjectVersion:7,operationId:randomUUID()}
 await assert.rejects(call('distribution_moderation_appeals',{...explicit,effect:'lift_current',lift:true}),error=>/invalid_request/.test(error.stderr))
 await call('distribution_moderation_appeals',explicit)
 await call('distribution_moderation_appeals',explicit)
 assert.equal(await query(`select count(*) from moderation_warning_withdrawals where measure_id='${next.id}'`),'1')
 assert.equal(await query(`select count(*) from moderation_measure_mail where measure_id='${next.id}' and kind='correction'`),'0','Le recours notifie son effet sans doubler le message de retrait')
 assert.equal(await query(`select effect from moderation_appeals where id='${secondAppeal}'`),'withdraw_warning')
 await query(`alter table moderation_subjects disable trigger moderation_retention_guard;update moderation_subjects set retain_until=now()-interval '1 day' where user_id='${player}';alter table moderation_subjects enable trigger moderation_retention_guard;set role service_role;select distribution_moderation_archive()`)
 assert.equal(await query(`select archived_at is null from moderation_facts where id='${fact.id}'`),'t','Les notifications non terminees preservent les justificatifs')
 await query(`update moderation_measure_mail set state='sent' where measure_id in(select m.id from moderation_measures m join moderation_subjects s on s.id=m.subject where s.user_id='${player}')`)
 for(let batch=0;batch<5;batch++)await query('set role service_role;select distribution_moderation_archive()')
 assert.equal(await query(`select archived_at is not null from moderation_facts where id='${fact.id}'`),'t')
 assert.equal(await query(`select archived_at is not null from moderation_warning_withdrawals where measure_id='${warn.id}'`),'t')
 assert.equal(await query(`select count(*) from moderation_fact_events where fact_id='${fact.id}'`),'3','Les references structurelles restent conservees apres expurgation')
 console.log('Faits et recours : cloture, retrait distinct, faits nouveaux, reouverture, acces prives et idempotence concurrente verifies.')
}

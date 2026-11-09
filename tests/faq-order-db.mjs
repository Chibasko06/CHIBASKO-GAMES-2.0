import assert from 'node:assert/strict'
export async function faqOrderingIntegration(query){
 const actor='faaf0000-0000-4000-8000-000000000001',normal='faaf0000-0000-4000-8000-000000000002'
 const literal=value=>"'"+JSON.stringify(value).replace(/[^\x00-\x7f]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')).replaceAll("'","''")+"'::jsonb"
 const rows=async()=>JSON.parse(await query("select coalesce(jsonb_agg(to_jsonb(f) order by sort_order),'[]') from faq_entries f"))
 const expected=row=>({question:row.question,answer:row.answer,is_published:row.is_published,sort_order:row.sort_order})
 const call=(action,id,input={},before=null,order=null,user=actor)=>`set role service_role;select admin_mutate_faq('${user}','${action}','${id}',${literal(input)},${before?literal(expected(before)):'null'},${order?"array["+order.map(row=>"'"+row.id+"'::uuid").join(',')+"]::uuid[]":'null'})`
 let initial=await rows()
 assert.deepEqual(initial.map(row=>row.sort_order),initial.map((_,i)=>i+1),'Les doublons historiques sont normalisés')
 assert.equal(initial.find(row=>row.question==='FAQ doublon A').answer,'[uBlock Origin](https://github.com/gorhill/uBlock#installation)')
 assert.equal(initial.find(row=>row.question==='FAQ doublon B').is_published,false)
 await query(`insert into auth.users(id,email) values('${actor}','faq-admin@example.test'),('${normal}','faq-player@example.test');insert into admin_users(user_id) values('${actor}')`)
 for(const row of initial){const list=await rows();await query(call('delete',row.id,{},list.find(item=>item.id===row.id),list))}
 const ids=[3,4,5,6].map(n=>'faaf0000-0000-4000-8000-'+String(n).padStart(12,'0'))
 for(const [i,id] of ids.entries())await query(call('create',id,{question:'ABCD'[i],answer:'Réponse\n[un lien](https://example.test/a)',is_published:true},null,await rows()))
 const verify=async text=>{const list=await rows();assert.equal(list.map(row=>row.question).join(''),text);assert.deepEqual(list.map(row=>row.sort_order),[...text].map((_,i)=>i+1));return list}
 const move=async(id,position)=>{const list=await rows();return query(call('move',id,{sort_order:position},list.find(row=>row.id===id),list))}
 await move(ids[3],1);await verify('DABC')
 await move(ids[3],4);await verify('ABCD')
 await move(ids[1],3);await verify('ACBD')
 await move(ids[1],2);await verify('ABCD')
 const stale=await rows();await move(ids[3],1)
 await assert.rejects(query(call('move',ids[1],{sort_order:4},stale[1],stale)),error=>/faq_conflict/.test(error.stderr))
 const race=await rows(),results=await Promise.allSettled([query(call('move',ids[0],{sort_order:4},race.find(row=>row.id===ids[0]),race)),query(call('move',ids[2],{sort_order:1},race.find(row=>row.id===ids[2]),race))])
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1)
 assert.equal(results.filter(result=>result.status==='rejected'&&/faq_conflict/.test(result.reason.stderr)).length,1)
 const before=await rows()
 await query("create function public.faq_test_fail() returns trigger language plpgsql as $$begin if new.question='C' then raise exception 'fixture_failure';end if;return new;end$$;create trigger faq_test_fail before update on faq_entries for each row execute function faq_test_fail()")
 await assert.rejects(move(ids[3],2),error=>/fixture_failure/.test(error.stderr))
 assert.deepEqual(await rows(),before,'Une erreur intermédiaire annule tout le déplacement')
 await query('drop trigger faq_test_fail on faq_entries;drop function public.faq_test_fail()')
 const first=(await rows())[0],changed={question:first.question,answer:'Texte intact\n[Markdown](https://example.test)',is_published:false,sort_order:2}
 await query(call('save',first.id,changed,first,await rows()))
 assert.equal((await rows()).find(row=>row.id===first.id).answer,changed.answer)
 await assert.rejects(query(call('save',first.id,changed,first)),error=>/faq_conflict/.test(error.stderr))
 for(const role of ['anon','authenticated']){
  assert.equal(await query(`select has_function_privilege('${role}','public.admin_mutate_faq(uuid,text,uuid,jsonb,jsonb,uuid[])','execute')`),'f')
  await assert.rejects(query(`set role ${role};select admin_mutate_faq('${actor}','delete','${first.id}')`))
 }
 await assert.rejects(query(call('delete',first.id,{},(await rows()).find(row=>row.id===first.id),null,normal)),error=>/forbidden/.test(error.stderr))
 await assert.rejects(query(`begin;update faq_entries set sort_order=1;set constraints all immediate;commit`))
 const append='faaf0000-0000-4000-8000-000000000007',input={question:'E',answer:'Éléments préservés',is_published:true}
 await query(call('create',append,input));assert.equal((await rows()).at(-1).question,'E')
 await query(call('create',append,input));assert.equal((await rows()).length,5,'Une création répétée ne duplique pas la question')
 await query(call('delete',append,{},(await rows()).at(-1),await rows()));assert.equal((await rows()).length,4)
 const visible=JSON.parse(await query("set role anon;select jsonb_agg(question order by sort_order) from faq_entries"))
 assert.deepEqual(visible,(await rows()).filter(row=>row.is_published).map(row=>row.question),'Ordre public identique après actualisation')
 assert.equal(visible.includes(first.question),false,'La FAQ publique conserve sa politique de publication')
 assert.deepEqual((await rows()).map(row=>row.sort_order),[1,2,3,4])
 console.log('FAQ SQL PASS : normalisation historique, mouvements, ajout/suppression, Markdown, concurrence, rollback, privilèges et publication.')
}

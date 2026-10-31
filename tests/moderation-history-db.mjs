import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export async function moderationHistoryIntegration(query){
 const admin=randomUUID(),player=randomUUID(),other=randomUUID(),subject=randomUUID(),name='lecture-'+player.slice(0,8)
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb"
 await query(`insert into auth.users(id,email,raw_user_meta_data) values('${admin}','${admin}@example.test','{"username":"read-${admin.slice(0,8)}"}'),('${player}','${player}@example.test','{"username":"${name}"}'),('${other}','${other}@example.test','{"username":"read-${other.slice(0,8)}"}');insert into admin_users(user_id) values('${admin}');insert into moderation_subjects(id,kind,user_id,version,retention_days,retain_until,measure) values('${subject}','player','${player}',31,365,now()+interval '365 days','ban')`)
 const ids=Array.from({length:31},()=>randomUUID())
 for(let i=0;i<31;i++){
  const action=i===25?'suspend':i===26||i===29?'ban':i===27?'lift':'warn'
  await query(`insert into moderation_measures(id,subject,actor,actor_reference,operation_hash,version,action,reason,note,ends_at,retention_days,created_at) values('${ids[i]}','${subject}','${admin}','${admin}',repeat('a',64),${i+1},'${action}','Motif communicable de la decision ${i}.','note-privee-fixture',${i===25?"now()-interval '8 days'":'null'},365,now()-interval '${i<25?10:i===25?9:33-i} days')`)
  if(i<25){const state=i%3===0?'pending':i%3===1?'accepted':'rejected';await query(`insert into moderation_appeals(id,measure,author,description,state,decision,reviewed_at,reviewer,reviewer_reference,created_at) values('${randomUUID()}','${ids[i]}','${player}','Texte du recours de qualification pour la lecture.','${state}',${state==='pending'?'null':"'Justification communicable du reexamen.'"},${state==='pending'?'null':'now()'},${state==='pending'?'null':"'"+admin+"'"},${state==='pending'?'null':"'"+admin+"'"},now()-interval '1 day')`)}
 }
 const read=async input=>{const raw=await query(`set role service_role;select distribution_moderation_browse('${admin}',${literal(input)})`);return raw?JSON.parse(raw):null}
 const first=await read({view:'measures',action:'warn',search:name})
 assert.equal(first.items.length,20);assert.equal(first.hasMore,true)
 const cursor=first.items.at(-1),second=await read({view:'measures',action:'warn',search:name,before:cursor.created_at,cursor:cursor.id})
 assert.equal(second.items.length,7);assert.equal(second.hasMore,false)
 assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,27)
 assert.doesNotMatch(JSON.stringify(first),/note-privee-fixture|operation_hash/)
 assert.equal((await read({view:'measures',search:name,state:'expired'})).items[0].id,ids[25])
 assert.equal((await read({view:'measures',search:name,state:'lifted'})).items[0].id,ids[26])
 assert.equal((await read({view:'measures',search:name,state:'active'})).items[0].id,ids[29])
 const detail=await read({view:'measures',id:ids[26]});assert.equal(detail.note,'note-privee-fixture');assert.equal(detail.next.id,ids[27]);assert.ok(detail.actor_name)
 const appeals=await read({view:'appeals',search:name}),last=appeals.items.at(-1)
 assert.equal(appeals.items.length,20);assert.equal(appeals.hasMore,true)
 assert.equal((await read({view:'appeals',search:name,before:last.created_at,cursor:last.id})).items.length,5)
 for(const state of ['pending','accepted','rejected']){
  const result=await read({view:'appeals',search:name,state});assert.ok(result.items.length>0);assert.ok(result.items.every(item=>item.state===state))
 }
 const appeal=await read({view:'appeals',id:appeals.items[0].id});assert.ok(appeal.measure.id);assert.equal(appeal.username,name)
 await query(`insert into moderation_measure_mail(measure_id,kind,version,notice,message) select '${ids[0]}','receipt',n,'{"text":"prive"}','{"html":"prive"}' from generate_series(1,25) n`)
 const messages=await read({view:'deliveries',id:ids[0]});assert.equal(messages.items.length,20);assert.equal(messages.hasMore,true)
 const mailCursor=messages.items.at(-1),mailNext=await read({view:'deliveries',id:ids[0],before:mailCursor.created_at,cursor:mailCursor.id})
 assert.ok(mailNext.items.length>0);assert.doesNotMatch(JSON.stringify(messages),/"message"|"notice"|"html"/)
 for(const role of ['anon','authenticated'])await assert.rejects(query(`set role ${role};select distribution_moderation_browse('${admin}','{"view":"measures"}')`))
 await assert.rejects(query(`set role service_role;select distribution_moderation_browse('${other}','{"view":"measures"}')`),error=>/forbidden/.test(error.stderr))
 await assert.rejects(query(`set role service_role;select moderation_measure_summary('${ids[0]}')`))
 const own=JSON.parse(await query(`set role authenticated;set request.jwt.claim.sub='${other}';select moderation_self_status()`))
 assert.equal(own.history.length,0);assert.doesNotMatch(JSON.stringify(own),/note-privee-fixture/)
 const restricted=JSON.parse(await query(`set role authenticated;set request.jwt.claim.sub='${player}';select moderation_self_status()`))
 assert.equal(restricted.blocked,true);assert.doesNotMatch(JSON.stringify(restricted),/note-privee-fixture|actor_reference/)
 const game=randomUUID(),gameSubject=randomUUID(),withdrawal=randomUUID(),restored=randomUUID()
 await query(`insert into games(id,title,slug,game_url,is_published) values('${game}','Lecture-jeu-${game}','lecture-${game}','https://example.test/game',true);insert into moderation_subjects(id,kind,game_id,version,retention_days,retain_until) values('${gameSubject}','game','${game}',2,365,now()+interval '365 days');insert into moderation_measures(id,subject,actor,actor_reference,operation_hash,version,action,reason,retention_days,created_at) values('${withdrawal}','${gameSubject}','${admin}','${admin}',repeat('b',64),1,'unpublish','Retrait temporaire puis restauration du jeu de fixture.',365,now()-interval '2 days'),('${restored}','${gameSubject}','${admin}','${admin}',repeat('c',64),2,'restore','La publication du jeu de fixture est restauree.',365,now()-interval '1 day')`)
 const games=await read({view:'measures',kind:'game',search:'Lecture-jeu-'+game});assert.equal(games.items.length,2)
 assert.equal(games.items.find(item=>item.id===withdrawal).state,'lifted');assert.equal(games.items.find(item=>item.id===restored).state,'recorded')

 await import('./register.mjs')
 const {GET}=await import('../app/api/admin/moderation/history/route.ts')
 const values={NEXT_PUBLIC_SUPABASE_URL:'https://history-db.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture'},previous=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]])),fetcher=globalThis.fetch
 Object.assign(process.env,values)
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://history-db.test')
  const token=new Headers(init?.headers).get('authorization')?.replace('Bearer ','')
  if(url.pathname==='/auth/v1/user')return Response.json({id:token===admin?admin:other})
  if(url.pathname==='/rest/v1/admin_users')return Response.json(token===admin?{user_id:admin}:null)
  assert.equal(url.pathname,'/rest/v1/rpc/distribution_moderation_browse');assert.equal(token,'server-fixture')
  const body=JSON.parse(init.body);assert.equal(body.p_actor,admin)
  return Response.json(await read(body.p_input))
 }
 const request=(token=admin,params='view=measures&search='+name)=>new Request('https://portal.test/api/admin/moderation/history?'+params,{headers:token?{Authorization:'Bearer '+token}:{}})
 try{
  assert.equal((await GET(request(null))).status,401);assert.equal((await GET(request(other))).status,403)
  const response=await GET(request());assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.equal((await response.json()).data.items.length,20)
  assert.equal((await GET(request(admin,'view=measures&before=invalid&cursor='+ids[0]))).status,400)
  assert.equal((await GET(request(admin,'view=measures&actor='+admin))).status,400)
  assert.equal((await GET(request(admin,'view=measures&id='+randomUUID()))).status,404)
 }finally{globalThis.fetch=fetcher;for(const key of Object.keys(values))if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}
 console.log('Centre de moderation : vrais handlers et PostgreSQL, historique global, recours traites, statuts, curseurs, notifications bornees et confidentialite verifies.')
}

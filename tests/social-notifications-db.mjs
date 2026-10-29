import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export async function socialNotificationsIntegration(query){
 await import('./register.mjs')
 const {GET,POST}=await import('../app/api/social/notifications/route.ts')
 const a='fa400000-0000-4000-8000-000000000001',b='fa400000-0000-4000-8000-000000000002',c='fa400000-0000-4000-8000-000000000003',game=randomUUID()
 await query(`insert into auth.users(id,email,raw_user_meta_data) values('${a}','notifications-a@example.test','{"username":"notification-alpha"}'),('${b}','notifications-b@example.test','{"username":"notification-beta"}'),('${c}','notifications-c@example.test','{"username":"notification-gamma"}');insert into public.games(id,title,slug,is_published,game_url) values('${game}','Jeu partage','notification-game',true,'https://example.test/game')`)
 const literal=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'"
 async function as(actor,sql){const output=await query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);select ${sql};commit;`);return JSON.parse(output.split(/\r?\n/).find(line=>/^(\{|\[|null|\d)/.test(line)))}
 const change=(actor,action,target,relation=null)=>as(actor,`public.social_change('${action}','${target}','${randomUUID()}',${literal(relation)}::uuid)`)
 const page=actor=>as(actor,"public.social_notifications_page()")
 const privateNames=['social_notifications','social_share_limits','social_share_cooldowns']
 for(const table of privateNames){assert.equal(await query(`select relrowsecurity from pg_class where oid='public.${table}'::regclass`),'t');for(const role of ['anon','authenticated'])assert.equal(await query(`select has_table_privilege('${role}','public.${table}','SELECT,INSERT,UPDATE,DELETE')`),'f')}
 for(const signature of ['social_notification_insert(uuid,uuid,text,uuid,uuid,uuid)','social_notification_current(uuid,uuid,uuid,text)','social_notify_block()','social_notify_relationship()','distribution_cleanup_social_notifications()'])assert.equal(await query(`select has_function_privilege('authenticated','public.${signature}','EXECUTE')`),'f')
 await assert.rejects(query('set role anon;select public.social_notifications_count()'))
 await query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${a}',true);select public.social_change('request','${b}',gen_random_uuid());rollback;`)
 assert.equal((await page(b)).items.length,0,'Une transaction annulée ne produit aucun événement')
 const sent=await change(a,'request',b)
 assert.equal((await page(a)).items.length,0)
 let received=await page(b);assert.equal(received.items.length,1);assert.equal(received.unreadCount,1);assert.equal(received.items[0].actionable,true)
 assert.equal((await page(c)).items.length,0)
 assert.equal(await as(c,`public.social_notifications_read(array['${received.items[0].id}']::uuid[])`),0)
 assert.equal((await page(b)).unreadCount,1)
 const acceptance=randomUUID(),accept=()=>as(b,`public.social_change('accept','${a}','${acceptance}','${sent.relationId}')`)
 await Promise.all([accept(),accept()]);assert.equal((await page(a)).items.filter(n=>n.kind==='friend_accepted').length,1)
 assert.equal((await page(b)).items[0].actionable,false);assert.equal((await page(b)).unreadCount,0)
 const operation=randomUUID(),share=()=>as(a,`public.social_share_game('${b}','${game}','${operation}')`)
 const pair=await Promise.all([share(),share()]);assert.deepEqual(pair.map(item=>item.replayed).sort(),[false,true])
 received=await page(b);assert.equal(received.items.filter(n=>n.kind==='game_shared').length,1)
 assert.equal(received.items.find(n=>n.kind==='game_shared').game.slug,'notification-game')
 await assert.rejects(as(a,`public.social_share_game('${b}','${game}','${randomUUID()}')`),error=>/social_rate_limited/.test(error.stderr))
 await assert.rejects(as(a,`public.social_share_game('${c}','${game}','${randomUUID()}')`),error=>/social_unavailable/.test(error.stderr))
 const snapshot=received.readIds
 await query(`update public.games set is_published=false where id='${game}'`)
 assert.equal((await page(b)).items.find(n=>n.kind==='game_shared').game,null)
 await assert.rejects(share(),error=>/social_unavailable/.test(error.stderr))
 await query(`update public.games set is_published=true where id='${game}'`)
 const late=await change(c,'request',b)
 await as(b,`public.social_notifications_read(array[${snapshot.map(literal).join(',')}]::uuid[])`)
 assert.equal((await page(b)).unreadCount,1,'Tout lire ne marque pas les arrivées ultérieures')
 await change(c,'cancel',b,late.relationId);assert.equal((await page(b)).unreadCount,0)
 await assert.rejects(change(b,'accept',c,late.relationId),error=>/social_conflict/.test(error.stderr))
 await change(a,'remove',b,sent.relationId)
 assert.equal((await page(b)).items.find(n=>n.kind==='game_shared').game,null)
 await change(a,'block',b);assert.equal((await page(a)).items.length,0);assert.equal((await page(b)).items.some(n=>n.sender.id===a),false)
 assert.deepEqual((await as(a,"public.social_share_friends()")).items,[])
 // Les données de transport passent par les vrais handlers, le client Supabase et les RPC du cluster jetable.
 const previousFetch=globalThis.fetch,previousUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,previousKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,calls=[]
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://notifications.test';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture-public'
 const parameters={social_navigation:[],social_notifications_count:[],social_notifications_page:[['p_kind','text'],['p_before','timestamptz'],['p_cursor','uuid']],social_notifications_read:[['p_ids','uuid[]']],social_share_friends:[['p_search','text'],['p_before','timestamptz'],['p_cursor','uuid']],social_share_game:[['p_target','uuid'],['p_game','uuid'],['p_operation','uuid']]}
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://notifications.test');calls.push(url.pathname)
  const actor=new Headers(init.headers).get('authorization')?.slice('Bearer '.length);assert.ok([a,b,c].includes(actor));assert.equal(init.cache,'no-store')
  if(url.pathname==='/auth/v1/user')return Response.json({id:actor})
  const name=url.pathname.split('/').at(-1),args=JSON.parse(init.body??'{}');assert.ok(parameters[name])
  const values=parameters[name].filter(([key])=>args[key]!==undefined).map(([key,type])=>`${key}=>${literal(Array.isArray(args[key])?'{'+args[key].join(',')+'}':args[key])}::${type}`)
  try{return Response.json(await as(actor,`public.${name}(${values.join(',')})`))}catch(error){return Response.json({code:'P0001',message:error.stderr?.match(/social_\w+/)?.[0]??'détail interne'},{status:400})}
 }
 async function http(actor,query='view=all',body){const response=await(body?POST:GET)(new Request('https://portal.test/api/social/notifications?'+query,{method:body?'POST':'GET',headers:{...(actor?{Authorization:'Bearer '+actor}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));assert.match(response.headers.get('cache-control'),/private.*no-store/);return {status:response.status,payload:await response.json()}}
 try{
  assert.equal((await http(null)).status,401);assert.equal(calls.length,0)
  calls.length=0;assert.equal((await http(b,'view=navigation')).status,200);assert.deepEqual(calls,['/auth/v1/user','/rest/v1/rpc/social_navigation'])
  for(const view of ['all','shares','friends','count']){calls.length=0;assert.equal((await http(b,'view='+view)).status,200);assert.equal(calls.length,2)}
  assert.equal((await http(b,'view=all&actor='+a)).status,400)
  assert.equal((await http(b,'view=all',{action:'read',ids:[]})).status,200)
  assert.equal((await http(a,'view=all',{action:'share',target:b,gameId:game,operationId:randomUUID()})).status,404)
 }finally{globalThis.fetch=previousFetch;if(previousUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previousUrl;if(previousKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=previousKey}
 const secondRelation=randomUUID()
 await query(`insert into public.social_relationships(id,user_low,user_high,requester,state) values('${secondRelation}',least('${b}'::uuid,'${c}'::uuid),greatest('${b}'::uuid,'${c}'::uuid),'${c}','accepted')`)
 const games=Array.from({length:21},()=>randomUUID())
 await query(`insert into public.games(id,title,slug,game_url,is_published) values ${games.map((id,index)=>`('${id}','Jeu ${index}','notification-quota-${index}','https://example.test/game',true)`).join(',')}`)
 for(const id of games.slice(0,20))await as(c,`public.social_share_game('${b}','${id}','${randomUUID()}')`)
 await assert.rejects(as(c,`public.social_share_game('${b}','${games[20]}','${randomUUID()}')`),error=>/social_rate_limited/.test(error.stderr))
 await query(`select public.social_notification_insert('${b}','${c}','game_shared',gen_random_uuid(),'${secondRelation}','${game}') from generate_series(1,205);update public.social_notifications set created_at='2026-10-29T12:00:00Z' where recipient='${b}'`)
 assert.equal(await query(`select count(*) from public.social_notifications where recipient='${b}'`),'200')
 let all=[],cursor=null
 do{
  const result=await as(b,`public.social_notifications_page('all',${literal(cursor?.createdAt)}::timestamptz,${literal(cursor?.id)}::uuid)`)
  assert.equal(result.unreadCount,10);all.push(...result.items.map(item=>item.id));cursor=result.nextCursor
 }while(cursor)
 assert.equal(all.length,200);assert.equal(new Set(all).size,200,'Le curseur conserve les dates identiques sans doublon ni omission')
 await query(`delete from public.social_share_limits where actor='${c}'`)
 const publication=await Promise.allSettled([as(c,`public.social_share_game('${b}','${game}','${randomUUID()}')`),query(`update public.games set is_published=false where id='${game}'`)])
 assert.equal(publication[1].status,'fulfilled')
 if(publication[0].status==='rejected')assert.match(publication[0].reason.stderr,/social_unavailable/)
 assert.equal((await page(b)).items.filter(item=>item.kind==='game_shared').every(item=>item.game===null),true)
 await query(`update public.games set is_published=true where id='${game}';delete from public.social_share_cooldowns where actor='${c}' and game_id='${game}'`)
 const concurrent=await Promise.allSettled([as(c,`public.social_share_game('${b}','${game}','${randomUUID()}')`),change(b,'block',c)])
 assert.equal(concurrent[1].status,'fulfilled');assert.equal((await page(b)).items.length,0)
 assert.equal((await page(c)).items.length,0)
 await query(`insert into public.social_notifications(recipient,sender,kind,event_id,expires_at) select '${b}','${c}','friend_request',gen_random_uuid(),now()-interval '1 day' from generate_series(1,501)`)
 assert.equal(await query('set role service_role;select public.distribution_cleanup_social_notifications()'),'500')
 assert.equal(await query('set role service_role;select public.distribution_cleanup_social_notifications()'),'1')
 assert.equal(await query('set role service_role;select public.distribution_cleanup_social_notifications()'),'0')
 await query(`insert into public.social_notifications(recipient,sender,kind,event_id) values('${b}','${c}','friend_request',gen_random_uuid())`)
 for(const actor of [b,a,c]){
  const job=JSON.parse(await query(`select public.distribution_account_request('${actor}','${actor}')`))
  const claim=JSON.parse(await query(`select public.distribution_account_claim('${job.id}')`))
  await query(`select public.distribution_account_prepare('${job.id}','${claim.lease}')`)
  assert.equal(await query(`select count(*) from public.social_notifications where recipient='${actor}' or sender='${actor}'`),'0')
  await assert.rejects(as(actor,'public.social_notifications_count()'),error=>/social_inactive/.test(error.stderr))
  await query(`delete from auth.users where id='${actor}';select public.distribution_account_auth_deleted('${job.id}','${claim.lease}')`)
 }
 await query(`delete from public.games where id='${game}' or slug like 'notification-quota-%'`)

 assert.equal(await query(`select count(*) from public.social_notifications where recipient in ('${a}','${b}','${c}') or sender in ('${a}','${b}','${c}')`),'0')
 console.log('Notifications : droits SQL, événements transactionnels, concurrence, obsolescence, partage, lecture et contrats HTTP validés sur PostgreSQL jetable.')
}

import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

// Le transport Supabase est adapté au cluster jetable ; les routes, le SDK
// serveur, les RPC, contraintes et permissions PostgreSQL restent exécutés.
export async function socialInterfaceIntegration(query){
 await import('./register.mjs')
 const {GET,POST}=await import('../app/api/social/route.ts')
 const ids={a:'fa300000-0000-4000-8000-000000000001',b:'fa300000-0000-4000-8000-000000000002',c:'fa300000-0000-4000-8000-000000000003'}
 await query(`insert into auth.users(id,email,raw_user_meta_data) values ${Object.entries(ids).map(([key,id])=>`('${id}','interface-${key}@example.test','{"username":"interface-${key}"}')`).join(',')};insert into public.admin_users(user_id) values('${ids.b}');select public.distribution_register_game('${ids.b}',gen_random_uuid(),'Jeu interface')`)
 const previousFetch=globalThis.fetch,previousUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,previousKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://social-interface.test';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture-public-key'
 const calls=[]
 const literal=value=>value===undefined||value===null?'null':"'"+String(value).replaceAll("'","''")+"'"
 const as=async(actor,sql)=>{
  const output=await query(`begin;set local role authenticated;select set_config('request.jwt.claim.sub','${actor}',true);${sql};commit;`)
  return JSON.parse(output.split(/\r?\n/).find(line=>line.startsWith('{')||line==='null'))
 }
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://social-interface.test')
  const key=new Headers(init?.headers).get('authorization')?.replace('Bearer fixture-',''),actor=ids[key]
  assert.ok(actor,'Le JWT de test doit désigner un compte connu')
  calls.push(url.pathname)
  if(url.pathname==='/auth/v1/user')return Response.json({id:actor})
  const args=JSON.parse(init.body),name=url.pathname.split('/').at(-1)
  const parameters={social_relation:[['p_target','uuid']],social_change:[['p_action','text'],['p_target','uuid'],['p_operation','uuid'],['p_relation','uuid']],social_list:[['p_kind','text'],['p_before','timestamptz'],['p_cursor','uuid']]}
  assert.ok(parameters[name]);assert.equal(init.cache,'no-store')
  try{return Response.json(await as(actor,`select public.${name}(${parameters[name].map(([key,type])=>literal(args[key])+'::'+type).join(',')})`))}
  catch(error){const message=error.stderr?.match(/social_(?:unauthorized|invalid|inactive|unavailable|conflict|rate_limited)/)?.[0]??'SQL interne de fixture';return Response.json({code:'P0001',message},{status:400})}
 }
 async function call(actor,bodyOrQuery){
  const get=typeof bodyOrQuery==='string'
  const request=new Request('https://portal.test/api/social'+(get?'?'+bodyOrQuery:''),{method:get?'GET':'POST',headers:{...(actor?{Authorization:'Bearer fixture-'+actor}:{}),'Content-Type':'application/json'},...(!get?{body:JSON.stringify(bodyOrQuery)}:{})})
  const response=await(get?GET:POST)(request)
  assert.match(response.headers.get('cache-control'),/private.*no-store/)
  return {status:response.status,body:await response.json()}
 }
 const relation=(actor,target)=>call(actor,'target='+ids[target])
 const change=(actor,action,target,relationId)=>call(actor,{action,target:ids[target],operationId:randomUUID(),...(relationId?{relationId}:{})})
 try{
  assert.equal((await call(null,'kind=friends')).status,401)
  assert.equal((await relation('a','a')).body.state,'self')
  calls.length=0;assert.equal((await relation('a','b')).body.state,'none')
  assert.deepEqual(calls,['/auth/v1/user','/rest/v1/rpc/social_relation'])
  const sent=await change('a','request','b');assert.equal(sent.body.state,'outgoing')
  assert.equal((await relation('b','a')).body.state,'incoming')
  assert.equal((await change('b','accept','a',sent.body.relationId)).body.state,'friends')
  const friends=await call('a','kind=friends')
  assert.equal(friends.body.items[0].profile.id,ids.b)
  assert.deepEqual(friends.body.items[0].profile.roles,{admin:true,developer:true})
  assert.equal((await call('c','kind=friends')).body.items.length,0)
  assert.equal((await change('a','remove','b',sent.body.relationId)).body.state,'none')
  const pending=await change('c','request','a')
  assert.equal((await change('c','cancel','a',pending.body.relationId)).body.state,'none')
  const received=await change('b','request','c')
  assert.equal((await change('c','reject','b',received.body.relationId)).body.state,'none')
  assert.equal((await change('a','block','b')).body.state,'blocked')
  assert.equal((await relation('a','b')).body.state,'unavailable')
  assert.equal((await relation('b','a')).body.state,'unavailable')
  assert.equal((await change('b','request','a')).status,404)
  assert.equal(await as(ids.a,"select coalesce(public.public_profile_resolve('@interface-b'),'null'::jsonb)"),null)
  assert.equal(await as(ids.b,"select coalesce(public.public_profile_resolve('"+ids.a+"'),'null'::jsonb)"),null)
  assert.equal((await as(ids.a,"select public.public_profiles_page('interface-b')")).total,0)
  assert.equal((await as(ids.b,"select public.public_profiles_page('interface-a')")).total,0)
  const blocked=await call('a','kind=blocked')
  assert.equal(blocked.body.items.length,1)
  await change('a','unblock','b',blocked.body.items[0].id)
  assert.equal((await relation('a','b')).body.state,'none')
  assert.equal((await call('a','kind=friends')).body.items.length,0)
  await assert.rejects(query(`set role anon;select public.social_relation('${ids.a}')`),error=>/permission denied|permission refusée/i.test(error.stderr))
  console.log('Interface sociale : routes HTTP réelles, authentification simulée, RPC et PostgreSQL réels validés.')
 }finally{
  globalThis.fetch=previousFetch
  for(const [name,value] of [['NEXT_PUBLIC_SUPABASE_URL',previousUrl],['NEXT_PUBLIC_SUPABASE_ANON_KEY',previousKey]]){if(value===undefined)delete process.env[name];else process.env[name]=value}
 }
}

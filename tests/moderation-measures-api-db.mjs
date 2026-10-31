import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'

export async function moderationMeasuresApiIntegration(query,{admin,player}){
 await import('./register.mjs')
 const names={MODERATION_MEASURES_ENABLED:'1',MODERATION_MEASURES_RETENTION_DAYS:'30',NEXT_PUBLIC_SUPABASE_URL:'https://measures-db.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-measures-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-measures-fixture',GAME_DISTRIBUTION_UPLOADS_ENABLED:'1'}
 const previous=Object.fromEntries(Object.keys(names).map(key=>[key,process.env[key]])),oldFetch=globalThis.fetch,oldPhase=globalThis.__phase0
 Object.assign(process.env,names)
 const adminRoute=await import('../app/api/admin/moderation/measures/route.ts'),selfRoute=await import('../app/api/account/moderation/route.ts'),social=await import('../app/api/social/route.ts'),developer=await import('../app/api/developer/games/route.ts'),profile=await import('../app/api/profile/public/route.ts')
 const literal=value=>value==null?'null':"'"+(typeof value==='object'?JSON.stringify(value):String(value)).replaceAll("'","''")+"'"
 const type={p_actor:'uuid',p_input:'jsonb',p_id:'uuid',p_measure:'uuid',p_description:'text',p_action:'text',p_target:'uuid',p_operation:'uuid',p_relation:'uuid',p_offset:'integer',p_before:'timestamptz',p_cursor:'uuid'}
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://measures-db.test')
  const actor=new Headers(init?.headers).get('authorization')?.replace('Bearer fixture-','')
  if(url.pathname==='/auth/v1/user')return [admin,player].includes(actor)?Response.json({id:actor}):Response.json({message:'expired'},{status:401})
  if(url.pathname==='/rest/v1/admin_users')return Response.json(actor===admin?{user_id:admin}:null)
  const role=actor==='Bearer server-measures-fixture'?'service_role':'authenticated'
  const privileged=new Headers(init.headers).get('authorization')==='Bearer server-measures-fixture'
  assert.ok(privileged||[player,admin].includes(actor))
  const name=url.pathname.split('/').at(-1),args=JSON.parse(init.body),sql=`set role ${privileged?'service_role':role};${privileged?'':`set request.jwt.claim.sub='${actor}';`}select public.${name}(${Object.entries(args).map(([key,value])=>{assert.ok(type[key]);return key+'=>'+literal(value)+'::'+type[key]}).join(',')})`
  assert.match(name,/^(distribution_(moderation_measure|developer_catalog|managed_catalog)|moderation_self_status|moderation_appeal|social_change)$/)
  try{return Response.json(JSON.parse(await query(sql)))}catch(error){return Response.json({code:'P0001',message:error.stderr?.match(/account_restricted|social_inactive|request_conflict|forbidden|invalid_request/)?.[0]??'internal'},{status:400})}
 }
 globalThis.__phase0={admin:{auth:{async getUser(){return {data:{user:{id:player}},error:null}}},async rpc(name,args){assert.equal(name,'distribution_account_access');return {data:(await query(`set role service_role;select public.distribution_account_access('${args.p_actor}')`))==='t',error:null}},from(){assert.fail('Une modification de profil restreint atteint la base')}}}
 const send=(path,actor,body)=>new Request('https://portal.test'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://portal.test',Authorization:'Bearer fixture-'+actor,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
 try{
  const current=await adminRoute.GET(send('/api/admin/moderation/measures?kind=player&target='+player,admin));assert.equal(current.status,200)
  const version=(await current.json()).data.version,operationId=randomUUID(),body={kind:'player',target:player,action:'ban',version,operationId,reason:'Decision de fixture verifiee par le handler et PostgreSQL.',note:'Note privee invisible au joueur.'}
  const response=await adminRoute.POST(send('/api/admin/moderation/measures',admin,body));assert.equal(response.status,200)
  assert.equal((await adminRoute.POST(send('/api/admin/moderation/measures',admin,body))).status,200)
  const status=await selfRoute.GET(send('/api/account/moderation',player));assert.equal(status.status,200);assert.match(status.headers.get('cache-control'),/private.*no-store/)
  const text=await status.text();assert.equal(JSON.parse(text).data.blocked,true);assert.doesNotMatch(text,/Note privee|actor_reference|operation_hash/)
  const mutation=await profile.PATCH(new Request('https://portal.test/api/profile/public',{method:'PATCH',headers:{Origin:'https://portal.test',Authorization:'Bearer fixture-'+player,'Content-Type':'application/json'},body:JSON.stringify({username:'measures-player',bio:null})}));assert.equal(mutation.status,403)
  assert.equal((await social.POST(send('/api/social',player,{action:'request',target:admin,operationId:randomUUID()}))).status,403)
  assert.equal((await developer.GET(send('/api/developer/games',player))).status,403)
  assert.equal((await selfRoute.POST(send('/api/account/moderation',player,{operationId:randomUUID(),measureId:operationId,description:'Reexamen demande avec un JWT deja ouvert avant le blocage.'}))).status,200)
  assert.equal((await adminRoute.POST(send('/api/admin/moderation/measures',player,{...body,operationId:randomUUID()}))).status,403)
  process.env.MODERATION_MEASURES_ENABLED='0'
  process.env.MODERATION_MEASURES_RETENTION_DAYS='incorrect'
  assert.equal((await adminRoute.POST(send('/api/admin/moderation/measures',admin,{...body,action:'lift',version:version+1,operationId:randomUUID()}))).status,200)
  assert.equal(JSON.parse(await query(`set role authenticated;set request.jwt.claim.sub='${player}';select public.moderation_self_status()`)).blocked,false)
  console.log('Mesures HTTP : vrais handlers, RPC PostgreSQL, ancien JWT, profil, social, developpeur et recours verifies.')
 }finally{
  globalThis.fetch=oldFetch;globalThis.__phase0=oldPhase
  for(const key of Object.keys(names))if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]
 }
}

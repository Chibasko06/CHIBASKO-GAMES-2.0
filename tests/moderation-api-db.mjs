import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
export async function moderationApiIntegration(query,ids){
 await import('./register.mjs')
 const {POST}=await import('../app/api/reports/route.ts'),adminRoute=await import('../app/api/admin/moderation/route.ts')
 const names=['MODERATION_ENABLED','MODERATION_CLOSED_RETENTION_DAYS','MODERATION_TURNSTILE_SECRET','CONTACT_HASH_SECRET','CHIBASKO_CLOUDFLARE','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]])),oldFetch=globalThis.fetch,calls=[];let challengeValid=true
 Object.assign(process.env,{MODERATION_ENABLED:'1',MODERATION_CLOSED_RETENTION_DAYS:'90',MODERATION_TURNSTILE_SECRET:'fixture-only',CONTACT_HASH_SECRET:'fixture-moderation-'.repeat(4),CHIBASKO_CLOUDFLARE:'1',NEXT_PUBLIC_SUPABASE_URL:'https://moderation.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture'})
 const literal=(value)=>value===null?'null':"'"+(typeof value==='object'?JSON.stringify(value).replace(/[^\x00-\x7f]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')):String(value)).replaceAll("'","''")+"'"
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));calls.push(url.pathname)
  if(url.hostname==='challenges.cloudflare.com')return Response.json({success:challengeValid,action:challengeValid?'moderation':'other',hostname:'portal.test'})
  assert.equal(url.origin,'https://moderation.test')
  const authorization=new Headers(init.headers).get('authorization'),actor=authorization?.replace('Bearer fixture-','')
  if(url.pathname==='/auth/v1/user')return Object.values(ids).includes(actor)?Response.json({id:actor}):Response.json({message:'expired'},{status:401})
  if(url.pathname==='/rest/v1/admin_users')return Response.json(actor===ids.admin?{user_id:ids.admin}:null)
  assert.equal(authorization,'Bearer server-fixture');assert.equal(init.cache,'no-store')
  if(url.pathname==='/rest/v1/moderation_cases'){
   const caseIds=url.searchParams.get('id').slice(4,-1).split(',');assert.ok(caseIds.length<=20)
   const rows=JSON.parse(await query("select coalesce(json_agg(json_build_object('id',c.id,'target_profile',(select json_build_object('username',p.username) from profiles p where p.id=c.target_user),'target_game_view',(select json_build_object('title',g.title,'is_published',g.is_published) from games g where g.id=c.target_game))),'[]'::json) from moderation_cases c where c.id in("+caseIds.map(literal).join(',')+")"));return Response.json(rows)
  }
  const args=JSON.parse(init.body),name=url.pathname.split('/').at(-1)
  assert.ok(['distribution_moderation_submit','distribution_moderation_admin'].includes(name))
  const type={p_actor:'uuid',p_input:'jsonb',p_client:'text',p_fingerprint:'text'}
  try{return Response.json(JSON.parse(await query(`set role service_role;select public.${name}(${Object.entries(args).map(([key,value])=>key+'=>'+literal(value)+'::'+type[key]).join(',')})`)))}
  catch(error){return Response.json({code:'P0001',message:error.stderr?.match(/(?:invalid_request|idempotency_conflict|forbidden|rate_limited|unauthorized|game_not_found)/)?.[0]??'internal'},{status:400})}
 }
 async function send(actor,body,admin=false,query=''){
  const method=body===undefined?'GET':'POST',request=new Request('https://portal.test/api/'+(admin?'admin/moderation':'reports')+query,{method,headers:{Origin:'https://portal.test','Content-Type':'application/json','cf-connecting-ip':'192.0.2.1',...(actor?{Authorization:'Bearer fixture-'+actor}:{})},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})
  const response=await(admin?method==='GET'?adminRoute.GET(request):adminRoute.POST(request):POST(request))
  assert.match(response.headers.get('cache-control'),/private.*no-store/)
  return {status:response.status,body:await response.json()}
 }
 const body={operationId:randomUUID(),kind:'player',target:ids.target,category:'spam',description:'API test : description du signalement assez precise.',contactName:'',contactEmail:'',goodFaith:false,sensitiveException:false,website:'',botToken:''}
 try{
  assert.equal((await send(null,undefined,true)).status,401)
  assert.equal((await send(ids.actor,undefined,true)).status,403)
  const saved=await send(ids.actor,body);assert.equal(saved.status,201,'Le blocage ne ferme pas le signalement')
  assert.equal((await send(ids.actor,body)).body.data.id,saved.body.data.id)
  assert.equal((await send(ids.actor,{...body,description:'Description modifiee avec la meme operation.'})).status,409)
  assert.equal((await send(ids.actor,'{')).status,400)
  assert.equal((await send('invalid-jwt',body)).status,401)
  assert.equal((await send(ids.actor,{...body,operationId:randomUUID(),target:ids.actor})).status,400)
  const gameReport=await send(ids.actor,{...body,operationId:randomUUID(),kind:'game',target:'https://chibaskogames.fr/games/moderation-fixture',category:'security'});assert.equal(gameReport.status,201)
  await query("update public.games set is_published=false where slug='moderation-fixture'")
  assert.equal((await send(ids.actor,{...body,operationId:randomUUID(),kind:'game',target:'moderation-fixture',category:'security'})).body.data.id,gameReport.body.data.id)
  assert.equal((await send(ids.actor,{...body,operationId:randomUUID(),kind:'game',target:'moderation-fixture',category:'security',description:'Nouveaux faits apres indisponibilite du jeu concerne.'})).status,404)
  await query("update public.games set is_published=true where slug='moderation-fixture'")
  assert.equal((await send(null,{...body,operationId:randomUUID()})).status,400)
  const guest=await send(null,{...body,operationId:randomUUID(),contactName:'Invitée',contactEmail:'guest@example.test',botToken:'fixture-token'});assert.equal(guest.status,201)
  challengeValid=false;assert.equal((await send(null,{...body,operationId:randomUUID(),contactName:'Fixture',contactEmail:'guest@example.test',botToken:'invalid'})).status,400);challengeValid=true
  const list=await send(ids.admin,undefined,true,'?state=open&page=1');assert.equal(list.status,200);assert.ok(list.body.data.items.length>0);assert.ok(list.body.data.items.some(item=>item.target_view?.username));assert.ok(list.body.data.items.some(item=>item.target_view?.title==='Moderation'))
  process.env.MODERATION_ENABLED='0';assert.equal((await send(ids.admin,undefined,true,'?page=1')).status,200);assert.equal((await send(ids.actor,body)).status,503);process.env.MODERATION_ENABLED='1'
  const detail=await send(ids.admin,undefined,true,'?id='+saved.body.data.id);assert.equal(detail.body.data.reporter,ids.actor)
  const decision={action:'update',id:saved.body.data.id,version:1,state:'dismissed',justification:'Examen effectue sans sanction automatique.',note:'Note privee de fixture.',privacyReviewed:false}
  assert.equal((await send(ids.admin,decision,true)).status,200)
  assert.equal((await send(ids.admin,decision,true)).status,409)
  assert.equal((await send(ids.admin,{...decision,id:gameReport.body.data.id,version:1},true)).status,200)
  assert.equal(await query("select is_published from public.games where slug='moderation-fixture'"),'t')
  assert.ok(calls.includes('/rest/v1/rpc/distribution_moderation_submit'))
  console.log('Moderation HTTP : vrais handlers, Auth, RPC PostgreSQL, invites, blocages, admin et conflits valides.')
 }finally{globalThis.fetch=oldFetch;for(const name of names)if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name]}
}

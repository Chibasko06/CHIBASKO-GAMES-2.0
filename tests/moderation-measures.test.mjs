import test from 'node:test'
import assert from 'node:assert/strict'
import {GET,POST} from '../app/api/admin/moderation/measures/route.ts'
import {GET as self,POST as appeal} from '../app/api/account/moderation/route.ts'
import {PATCH as profile} from '../app/api/profile/public/route.ts'
import {deliverModeration} from '../lib/moderationDelivery.ts'

const admin='fa900000-0000-4000-8000-000000000001',player='fa900000-0000-4000-8000-000000000002'
function environment(t){
 const values={MODERATION_MEASURES_ENABLED:'1',MODERATION_MEASURES_RETENTION_DAYS:'30',NEXT_PUBLIC_SUPABASE_URL:'https://measures.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'private-fixture'}
 const before=Object.fromEntries(Object.keys(values).map(key=>[key,process.env[key]]));Object.assign(process.env,values)
 t.after(()=>{for(const key of Object.keys(values))if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key]})
 const calls=[]
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const url=new URL(String(input)),headers=new Headers(init?.headers),actor=headers.get('authorization')?.replace('Bearer ','');assert.equal(url.origin,'https://measures.test');calls.push({path:url.pathname,actor,body:init?.body})
  if(url.pathname==='/auth/v1/user')return actor===admin||actor===player?Response.json({id:actor}):Response.json({message:'expired'},{status:401})
  if(url.pathname==='/rest/v1/admin_users')return Response.json(actor===admin?{user_id:admin}:null)
  if(url.pathname==='/rest/v1/rpc/moderation_self_status'){assert.equal(actor,player);return Response.json({blocked:true,history:[]})}
  if(url.pathname==='/rest/v1/rpc/moderation_appeal'){assert.equal(actor,player);return Response.json({state:'pending'})}
  if(url.pathname==='/rest/v1/rpc/distribution_moderation_measure'){assert.equal(actor,'private-fixture');const body=JSON.parse(init.body);assert.equal(body.p_actor,admin);return Response.json({version:1,history:[]})}
  assert.fail('Requête inattendue : '+url.pathname)
 })
 return calls
}
function request(body,actor=admin,path='/api/admin/moderation/measures'){
 return new Request('https://portal.test'+path,{method:body===undefined?'GET':'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json',...(actor?{Authorization:'Bearer '+actor}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
}
const measure={kind:'player',target:player,action:'ban',version:0,operationId:'fa900000-0000-4000-8000-000000000003',reason:'Motif factuel suffisamment explicite.',note:'Note strictement privee.'}
test('vrais handlers : refus invités et non-administrateurs avant toute RPC privilégiée',async t=>{
 const calls=environment(t)
 assert.equal((await POST(request(measure,null))).status,401);assert.equal((await POST(request(measure,player))).status,403)
 assert.equal(calls.some(call=>call.path.includes('/rpc/')),false)
})
test('mesures : flag, validation stricte, identité vérifiée et absence de cache public',async t=>{
 const calls=environment(t);process.env.MODERATION_MEASURES_ENABLED='0';assert.equal((await POST(request(measure))).status,503)
 process.env.MODERATION_MEASURES_ENABLED='1';for(const body of [{...measure,actor:player},{...measure,reason:'court'},{...measure,version:'0'},{...measure,note:'x'.repeat(5001)}])assert.equal((await POST(request(body))).status,400)
 assert.equal(calls.some(call=>call.path.includes('/rpc/')),false)
 const response=await POST(request(measure));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/)
 delete process.env.MODERATION_MEASURES_RETENTION_DAYS
 assert.equal((await POST(request(measure))).status,503)
 assert.equal((await POST(request({...measure,retentionDays:30}))).status,400)
 process.env.MODERATION_MEASURES_ENABLED='0'
 assert.equal((await POST(request({...measure,action:'lift'}))).status,200,'Une désactivation ne bloque pas les levées')
 assert.equal((await GET(request(undefined,admin,'/api/admin/moderation/measures?kind=player&target='+player))).status,200)
})
test('un JWT encore valide donne accès au recours, sans autoriser un profil restreint',async t=>{
 environment(t);process.env.MODERATION_MEASURES_ENABLED='0'
 const status=await self(request(undefined,player,'/api/account/moderation'));assert.equal(status.status,200);assert.equal((await status.json()).data.blocked,true)
 assert.equal((await self(request(undefined,player,'/api/account/moderation?user='+admin))).status,400)
 assert.equal((await appeal(request({operationId:measure.operationId,measureId:measure.operationId,description:'Les faits doivent faire l’objet d’un reexamen.'},player,'/api/account/moderation'))).status,200)
 globalThis.__phase0={admin:{auth:{async getUser(){return {data:{user:{id:player}},error:null}}},async rpc(name,args){assert.equal(name,'distribution_account_access');assert.equal(args.p_actor,player);return {data:false,error:null}},from(){assert.fail('Mutation d’un profil restreint')}}}
 const response=await profile(new Request('https://portal.test/api/profile/public',{method:'PATCH',headers:{Origin:'https://portal.test',Authorization:'Bearer '+player,'Content-Type':'application/json'},body:JSON.stringify({username:'joueur-fixture',bio:null})}))
 assert.equal(response.status,403);assert.equal((await response.json()).code,'account_restricted')
})
test('e-mail de mesure : même moteur durable, HTML échappé et confirmation du bon flux',async()=>{
 const job={id:measure.operationId,lease:player,stream:'measure',kind:'decision',notice:{title:'Suspension temporaire',text:'Motif <script>danger</script>\nFin : demain.'},case:{id:measure.operationId,number:1,category:'other',target_kind:'player',contact_email:'player@example.test'},message:null}
 const events=[];let claimed=false
 const db={async call(name,args){events.push(name);if(name==='distribution_moderation_claim_mail'){if(claimed)return null;claimed=true;return job}if(name==='distribution_moderation_prepare_measure_mail')return args.p_message;if(name==='distribution_moderation_finish_measure_mail'){assert.equal(args.p_success,true);return null}assert.fail(name)}}
 const env={MODERATION_MAINTENANCE_ENABLED:'1',RESEND_API_KEY:'fixture',RESEND_FROM_EMAIL:'noreply@example.test',GAME_SUBMISSION_NOTIFY_EMAIL:'admin@example.test',MODERATION_APPEAL_EMAIL:'appeal@example.test',NEXT_PUBLIC_SITE_URL:'https://portal.test'}
 const sent=await deliverModeration(db,env,{log(){},fetcher:async(input,init)=>{const body=JSON.parse(init.body);assert.match(body.html,/&lt;script&gt;/);assert.doesNotMatch(body.html,/<script>/);assert.match(body.text,/appeal@example.test/);assert.match(body.text,/account\/moderation/);return Response.json({id:'mail-fixture'})}})
 assert.equal(sent,1);assert.ok(events.includes('distribution_moderation_finish_measure_mail'));assert.equal(events.includes('distribution_moderation_finish_mail'),false)
})

test('e-mail de mesure : une panne conserve le message et la même clé lors de la reprise',async()=>{
 const job={id:measure.operationId,lease:player,stream:'measure',kind:'decision',notice:{title:'Avertissement',text:'Motif communicable de fixture.'},case:{id:measure.operationId,number:1,category:'other',target_kind:'player',contact_email:'player@example.test'},message:null}
 let available=true,preparations=0
 const acknowledgements=[],sent=[]
 const db={async call(name,args){
  if(name==='distribution_moderation_claim_mail'){if(!available)return null;available=false;return job}
  if(name==='distribution_moderation_prepare_measure_mail'){preparations++;job.message=args.p_message;return job.message}
  if(name==='distribution_moderation_finish_measure_mail'){acknowledgements.push(args.p_success);return null}
  assert.fail(name)
 }}
 const env={MODERATION_MAINTENANCE_ENABLED:'1',RESEND_API_KEY:'fixture',RESEND_FROM_EMAIL:'noreply@example.test',GAME_SUBMISSION_NOTIFY_EMAIL:'admin@example.test',MODERATION_APPEAL_EMAIL:'appeal@example.test',NEXT_PUBLIC_SITE_URL:'https://portal.test'}
 const fetcher=async(input,init)=>{sent.push({key:new Headers(init.headers).get('Idempotency-Key'),body:init.body});return sent.length===1?Response.json({message:'unavailable'},{status:503}):Response.json({id:'receipt-fixture'})}
 assert.equal(await deliverModeration(db,env,{fetcher,log(){}}),0)
 available=true
 assert.equal(await deliverModeration(db,env,{fetcher,log(){}}),1)
 assert.deepEqual(acknowledgements,[false,true]);assert.equal(preparations,2);assert.deepEqual(sent[0],sent[1])
})

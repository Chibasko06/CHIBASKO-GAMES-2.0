import {test,beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {GET,POST} from '../app/api/social/route.ts'

const actor='fe000000-0000-4000-8000-000000000001',target='fe000000-0000-4000-8000-000000000002',operationId='fe000000-0000-4000-8000-000000000003'
let calls,result,failure,authorized
beforeEach(t=>{
 calls=[];result={items:[],nextCursor:null};failure=null;authorized=true
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://social.example.test';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='fixture-public-key'
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=new URL(String(input)).pathname
  calls.push({path,body:init?.body?JSON.parse(init.body):null,headers:new Headers(init?.headers)})
  assert.equal(init.cache,'no-store')
  if(path==='/auth/v1/user')return authorized?Response.json({id:actor}):Response.json({message:'Session invalide'},{status:401})
  assert.match(path,/\/rest\/v1\/rpc\/social_(?:list|change|relation)$/)
  assert.equal(new Headers(init.headers).get('authorization'),'Bearer fixture-user-token')
  return failure?Response.json({code:'P0001',message:failure},{status:400}):Response.json(result)
 })
})
const request=(body,token=true)=>new Request('https://portal.test/api/social',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer fixture-user-token'}:{})},body:typeof body==='string'?body:JSON.stringify(body)})
const body={action:'request',target,operationId}

test('les routes sociales exigent un Bearer vérifié et refusent les cookies seuls et les origines tierces',async()=>{
 assert.equal((await GET(new Request('https://portal.test/api/social',{method:'HEAD'}))).status,405);assert.equal(calls.length,0)
 assert.equal((await POST(request(body,false))).status,401);assert.equal(calls.length,0)
 const foreign=request(body);foreign.headers.set('Origin','https://other.test')
 assert.equal((await POST(foreign)).status,403);assert.equal(calls.length,0)
 authorized=false;assert.equal((await POST(request(body))).status,401);assert.equal(calls.length,1)
})
test('une page privée utilise une validation Auth et une RPC, sans identifiant de propriétaire fourni par le client',async()=>{
 const response=await GET(new Request('https://portal.test/api/social?kind=incoming',{headers:{Authorization:'Bearer fixture-user-token'}}))
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private.*no-store/)
 assert.match(response.headers.get('vary'),/Cookie.*Authorization/)
 assert.deepEqual(calls.map(c=>c.path),['/auth/v1/user','/rest/v1/rpc/social_list'])
 assert.deepEqual(calls[1].body,{p_kind:'incoming'})
})
test('les mutations transmettent seulement action, cible, reçu et relation ; pas de rôle ou acteur client',async()=>{
 result={state:'outgoing',relationId:operationId,replayed:false}
 const response=await POST(request(body));assert.equal(response.status,200)
 assert.deepEqual(calls[1].body,{p_action:'request',p_target:target,p_operation:operationId})
 for(const invalid of ['{',{...body,actor},{...body,action:'ban'},{...body,target:'../admin'},{...body,action:'accept'},{...body,action:'unblock'}]){
  calls=[];assert.equal((await POST(request(invalid))).status,400);assert.equal(calls.length,1)
 }
})
test('les erreurs SQL attendues sont stables et aucune erreur interne ne sort au navigateur',async t=>{
 for(const [message,status] of [['social_conflict',409],['social_rate_limited',429],['social_unavailable',404],['social_inactive',403]]){
  failure=message;assert.equal((await POST(request(body))).status,status)
 }
 const logs=[];t.mock.method(console,'error',value=>logs.push(value))
 failure='private SQL token password actor'
 const response=await POST(request(body));assert.equal(response.status,503)
 assert.doesNotMatch(await response.text(),/private SQL|password/)
 assert.doesNotMatch(logs.join(' '),/private SQL|password|fixture-user-token/)
})
test('les curseurs préservent les microsecondes et rejettent les paramètres ambigus ou privés',async()=>{
 const before='2026-10-30T12:00:00.123456+00:00'
 const query=new URLSearchParams({kind:'blocked',before,cursor:target})
 assert.equal((await GET(new Request('https://portal.test/api/social?'+query,{headers:{Authorization:'Bearer fixture-user-token'}}))).status,200)
 assert.equal(calls[1].body.p_before,before)
 for(const query of ['kind=friends&user='+target,'kind=friends&kind=blocked','before=invalid','kind=unknown']){
  calls=[];assert.equal((await GET(new Request('https://portal.test/api/social?'+query,{headers:{Authorization:'Bearer fixture-user-token'}}))).status,400)
  assert.equal(calls.length,1)
 }
})

 test('la lecture ciblée refuse les paramètres supplémentaires et ne parcourt aucune liste',async()=>{
 result={state:'incoming',relationId:operationId};
 const response=await GET(new Request('https://portal.test/api/social?target='+target,{headers:{Authorization:'Bearer fixture-user-token'}}));
 assert.equal(response.status,200);assert.equal(calls[1].path,'/rest/v1/rpc/social_relation');assert.deepEqual(calls[1].body,{p_target:target});
 for(const query of ['target='+target+'&kind=friends','target=invalid','target='+target+'&target='+target]){calls=[];assert.equal((await GET(new Request('https://portal.test/api/social?'+query,{headers:{Authorization:'Bearer fixture-user-token'}}))).status,400);assert.equal(calls.length,1)}
})

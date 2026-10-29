import {test,beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {GET,POST,HEAD} from '../app/api/social/notifications/route.ts'
import {parseNotificationPage} from '../lib/socialNotifications.ts'
const actor='fa400000-0000-4000-8000-000000000001',target='fa400000-0000-4000-8000-000000000002'
let calls,result,failure,identityFailure
beforeEach(t=>{
 calls=[];result=0;failure=null;identityFailure=false
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://notifications.test';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-fixture'
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=new URL(String(input)).pathname;calls.push({path,args:JSON.parse(init.body??'{}')});assert.equal(init.cache,'no-store')
  if(path==='/auth/v1/user')return identityFailure?Response.json({message:'Session expirée'},{status:401}):Response.json({id:actor})
  return failure?Response.json({code:'P0001',message:failure},{status:400}):Response.json(result)
 })
})
function request(query='',body,token=true){return new Request('https://portal.test/api/social/notifications?'+query,{method:body===undefined?'GET':'POST',headers:{...(token?{Authorization:'Bearer fixture'}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})}
test('notifications privées : Auth vérifiée, origine, méthodes, cache et compteur mutualisé',async()=>{
 assert.equal((await HEAD(new Request('https://portal.test',{method:'HEAD'}))).status,405)
 assert.equal((await GET(request('',undefined,false))).status,401);assert.equal(calls.length,0)
 const foreign=request('',{action:'read',ids:[]});foreign.headers.set('Origin','https://other.test');assert.equal((await POST(foreign)).status,403);assert.equal(calls.length,0)
 identityFailure=true;assert.equal((await GET(request('view=count'))).status,401);assert.deepEqual(calls.map(item=>item.path),['/auth/v1/user']);identityFailure=false;calls=[]
 result={avatarUrl:null,isAdmin:false,unreadCount:0};const response=await GET(request('view=navigation'));assert.equal(response.status,200)
 assert.match(response.headers.get('cache-control'),/private.*no-store/);assert.match(response.headers.get('vary'),/Authorization/)
 assert.deepEqual(calls.map(item=>item.path),['/auth/v1/user','/rest/v1/rpc/social_navigation'])
})
test('pagination et recherche sont bornées et sans propriétaire choisi par le navigateur',async()=>{
 for(const query of ['view=all&actor='+target,'view=count&before=2026-01-01T00:00:00Z&cursor='+actor,'view=all&search=abc','view=friends&search='+ 'a'.repeat(33),'view=all&cursor='+actor,'view=all&view=shares'])assert.equal((await GET(request(query))).status,400)
 const response=await GET(request('view=friends&search=%40ami'));assert.equal(response.status,200);assert.deepEqual(calls.at(-1).args,{p_search:'@ami'})
})
test('lecture et partage réutilisent leurs opérations bornées, sans exposer les erreurs DB',async()=>{
 assert.equal((await POST(request('',{action:'read',ids:[target]}))).status,200);assert.deepEqual(calls.at(-1).args,{p_ids:[target]})
 for(const body of ['{',{}, {action:'read',ids:Array(201).fill(target)}, {action:'read',ids:[null]},{action:'share',target,gameId:actor,operationId:'bad'}])assert.equal((await POST(request('',body))).status,400)
 failure='secret SQL interne';let response=await POST(request('',{action:'share',target,gameId:actor,operationId:actor}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/secret SQL/)
 failure='social_rate_limited';response=await POST(request('',{action:'share',target,gameId:actor,operationId:actor}));assert.equal(response.status,429)
})
test('la projection cliente rejette les curseurs, pseudos et liens dangereux',()=>{
 const item={id:actor,createdAt:'2026-10-29T12:00:00Z',kind:'game_shared',read:false,actionable:false,relationId:target,sender:{id:target,username:'ami-public'},game:{slug:'jeu-public',title:'Jeu'}}
 const page={items:[item],readIds:[actor],nextCursor:null,unreadCount:1};assert.equal(parseNotificationPage(page).items[0].game.slug,'jeu-public')
 assert.throws(()=>parseNotificationPage({...page,items:[{...item,game:{slug:'../admin',title:'Jeu'}}]}))
 assert.throws(()=>parseNotificationPage({...page,unreadCount:11}));assert.throws(()=>parseNotificationPage({...page,items:[item,item]}))
})

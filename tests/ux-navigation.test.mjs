import test from 'node:test'
import assert from 'node:assert/strict'
import {GET} from '../app/api/players/suggestions/route.ts'
import {safeAuthNext,getOAuthRedirectUrl} from '../lib/authRedirect.ts'

test('suggestions : aucune lecture sous trois caractères ou pour une recherche invalide',async()=>{
 let calls=0
 globalThis.__reliability={db:{rpc(){calls++;throw Error('unexpected')}}}
 for(const value of ['', 'a','ab','@ab','a b','x'.repeat(33)]){
  const response=await GET(new Request('https://portal.test/api/players/suggestions?'+new URLSearchParams({search:value})))
  assert.deepEqual(await response.json(),{items:[]});assert.equal(response.headers.get('Cache-Control'),'private, no-store')
 }
 assert.equal(calls,0)
})
test('suggestions : RPC de visibilité du visiteur, première page et cinq projections minimales',async()=>{
 const calls=[]
 globalThis.__reliability={db:{rpc:async(name,args)=>{calls.push({name,args});return {data:{total:1000,items:Array.from({length:24},(_,i)=>({id:'id'+i,username:'chi'+i,avatar_url:null,bio:'publique',created_at:'2026-01-01',roles:{admin:false,developer:false},email:'private@example.test'}))},error:null}}}}
 const response=await GET(new Request('https://portal.test/api/players/suggestions?search=@CHI'))
 const payload=await response.json()
 assert.equal(payload.items.length,5);assert.deepEqual(Object.keys(payload.items[0]),['username','avatar_url'])
 assert.deepEqual(calls,[{name:'public_profiles_page',args:{p_search:'chi',p_page:1,p_role:'all',p_id:null}}])
 assert.equal(response.headers.get('Vary'),'Cookie')
 assert.doesNotMatch(JSON.stringify(payload),/private|email|bio|id0/)
})
test('suggestions : panne DB distincte de résultats vides, sans diagnostic privé',async()=>{
 globalThis.__reliability={db:{rpc:async()=>({data:null,error:{message:'private connection detail',code:'08006'}})}}
 const response=await GET(new Request('https://portal.test/api/players/suggestions?search=chi'))
 assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private connection/)
})
test('retour Auth : destination interne conservée, redirections externes refusées',()=>{
 const next='/games/pong?mode=local'
 assert.equal(safeAuthNext(next),next)
 assert.equal(new URL(getOAuthRedirectUrl(next)).searchParams.get('next'),next)
 for(const value of ['https://evil.test','//evil.test','/\\evil.test','/%2f%2fevil.test','/games?token=secret','/\n/evil.test'])assert.equal(safeAuthNext(value),'/')
})

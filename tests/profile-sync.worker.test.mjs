import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {Miniflare,convertV4MiniflareOptions} from 'miniflare'

test('le contrat profil traverse la vraie route dans Workers, sans dépendre des cookies',async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {POST} from './app/api/profile/sync/route'
 let profile={id:'fixture-user',username:'Joueur',display_name:'Joueur',bio:null},writes=0,reads=0
 globalThis.fixtureDb={async rpc(name,args){if(name!=='distribution_account_access')throw Error('unexpected_rpc');return {data:true,error:null}},auth:{async getUser(token){return token==='expired'?{data:{user:null},error:{status:401}}:{data:{user:{id:'fixture-user',email:'fixture@example.test',user_metadata:{}}},error:null}}},from(){let username=false;return {select(){return this},eq(key){username=key==='username';return this},async maybeSingle(){reads++;return {data:username?null:profile,error:null}},insert(value){writes++;profile=value;return this},async single(){return {data:profile,error:null}}}}}
 export default {async fetch(request){
  if(new URL(request.url).pathname==='/missing')profile=null
  const hasBody=!!request.body
  const response=await POST(request)
  response.headers.set('X-Fixture-Body',String(hasBody));response.headers.set('X-Fixture-Writes',String(writes));response.headers.set('X-Fixture-Reads',String(reads))
  return response
 }}
 `},bundle:true,write:false,format:'esm',platform:'browser',plugins:[{name:'services-isoles',setup(b){
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}))
  b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'fixture'}))
  b.onResolve({filter:/^@\/lib\/supabaseAdmin$/},()=>({path:'db',namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({contents:path==='next'?'export const NextResponse=Response':path==='db'?'export function getSupabaseAdminClient(){return globalThis.fixtureDb}':'export {}',loader:'js'}))
 }}]})
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-10-01'}))
 try{
  const legacy=await mf.dispatchFetch('https://portal.test/api/profile/sync',{method:'POST',headers:{Authorization:'Bearer fresh'}})
  assert.equal(legacy.headers.get('X-Fixture-Body'),'true')
  assert.equal(legacy.status,415)
  assert.equal(legacy.headers.get('X-Fixture-Reads'),'0')
  const send=(path='/api/profile/sync',token='fresh')=>mf.dispatchFetch('https://portal.test'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'})
  const existing=await send()
  assert.equal(existing.status,200);assert.equal((await existing.json()).created,false)
  assert.equal(existing.headers.get('X-Fixture-Writes'),'0')
  const repaired=await send('/missing')
  assert.equal(repaired.status,200);assert.equal((await repaired.json()).created,true)
  const repeated=await send();assert.equal(repeated.headers.get('X-Fixture-Writes'),'1')
  assert.equal((await send('/api/profile/sync','expired')).status,401)
  assert.equal((await mf.dispatchFetch('https://portal.test/api/profile/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401)
 }finally{await mf.dispose()}
})

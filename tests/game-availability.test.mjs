import test from 'node:test'
import assert from 'node:assert/strict'
import {onlineAvailabilityRepository,publishedOnlineAccess} from '../lib/server/publishedOnlineAccess.ts'
import {multiplayerDependencies,multiplayerRequest} from '../lib/server/multiplayerLobbies.ts'

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
test('capability alone is unavailable; only exact-version active deployments with safe endpoints are available',async()=>{
 for(const rows of [[],[{endpoint:'javascript:alert(1)'}],[{endpoint:'wss://localhost/'}],[{endpoint:'wss://gameplay.chibaskogames.fr/'}]]){
  const requests=[],db=onlineAvailabilityRepository('https://database.test','fixture-only',async(input,init)=>{
   const url=new URL(input);requests.push(url)
   assert.equal(init.cache,'no-store')
   return Response.json(url.pathname.includes('/rpc/')?true:rows)
  })
  assert.equal(await publishedOnlineAccess(id,version,'public',db),rows[0]?.endpoint==='wss://gameplay.chibaskogames.fr/')
  const query=requests[1].searchParams
  assert.equal(query.get('game_id'),'eq.'+id);assert.equal(query.get('status'),'eq.active')
  assert.equal(query.get('game_server_deployment_versions.version_id'),'eq.'+version)
  assert.equal(query.get('order'),'created_at.asc,id.asc')
 }
 let calls=0
 assert.equal(await publishedOnlineAccess(id,version,'private',{access:async()=>false,deployment:async()=>{calls++;return true}}),false)
 assert.equal(calls,0)
})
test('deployment lookup failures remain explicit, without credentials in errors',async()=>{
 const db=onlineAvailabilityRepository('https://database.test','fixture-secret',async()=>{throw new Error('fixture-secret')})
 await assert.rejects(db.deployment(id,version),e=>e.code==='database_error'&&!e.message.includes('fixture-secret'))
})
test('direct create lobby request cannot mutate or create a session when no deployment exists',async()=>{
 const previous={fetch:globalThis.fetch,state:globalThis.__phase0,url:process.env.NEXT_PUBLIC_SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}
 const calls=[]
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://database.test';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-only'
 const chain={select(){return this},eq(){return this},async maybeSingle(){return {data:{active_version_id:version},error:null}}}
 globalThis.__phase0={admin:{from(){return chain}}}
 globalThis.fetch=async input=>{const path=new URL(input).pathname;calls.push(path);return Response.json(path.includes('/rpc/')?true:[])}
 try{
  const request=new Request('https://portal.test/api/multiplayer/lobbies',{method:'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json'},body:JSON.stringify({gameId:id,access:'public',requestId:version})})
  const response=await multiplayerRequest(request,['lobbies'],{actor:async()=>id,service:multiplayerDependencies.service})
  assert.equal(response.status,409);assert.equal((await response.json()).error.code,'deployment_unavailable')
  assert.ok(!calls.some(path=>path.includes('multiplayer_create')||path.includes('prepare_online_session')))
  globalThis.fetch=async input=>{
   const path=new URL(input).pathname;calls.push(path)
   return Response.json(path.endsWith('distribution_multiplayer_create')?{id}:path.includes('/rpc/')?true:[{endpoint:'wss://gameplay.chibaskogames.fr/'}])
  }
  const retry=new Request(request.url,{method:'POST',headers:{Origin:'https://portal.test','Content-Type':'application/json'},body:JSON.stringify({gameId:id,access:'public',requestId:version})})
  const enabled=await multiplayerRequest(retry,['lobbies'],{actor:async()=>id,service:multiplayerDependencies.service})
  assert.equal(enabled.status,200)
  assert.ok(calls.some(path=>path.endsWith('distribution_multiplayer_create')))
 }finally{
  globalThis.fetch=previous.fetch;globalThis.__phase0=previous.state
  for(const [name,value]of [['NEXT_PUBLIC_SUPABASE_URL',previous.url],['SUPABASE_SERVICE_ROLE_KEY',previous.key]])if(value===undefined)delete process.env[name];else process.env[name]=value
 }
})

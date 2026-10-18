import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {gameServerSession} from '../lib/server/gameServerSession.ts'

test('server roster authenticates deployment, hashes credential and exposes only the private RPC projection',async()=>{
 const session='s_'+'1'.repeat(32),credential='a'.repeat(64),calls=[]
 const db={async call(name,args){calls.push({name,args});return {data:{onlineSessionId:session,participants:[{id:'p_'+'2'.repeat(32),displayName:'Player'}]}}}}
 const request=auth=>new Request('https://portal.test/api/game-server/v1/sessions/'+session,{headers:auth?{Authorization:'Bearer '+auth}:{}})
 assert.equal((await gameServerSession(request(),session,db)).status,401)
 assert.equal((await gameServerSession(request(credential),'../../credential',db)).status,400)
 assert.equal(calls.length,0)
 const response=await gameServerSession(request(credential),session,db)
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.equal(calls[0].name,'distribution_server_session')
 assert.equal(calls[0].args.p_credential_hash,createHash('sha256').update(credential).digest('hex'))
 assert.ok(!JSON.stringify(calls).includes(credential));assert.ok(!JSON.stringify(await response.json()).includes(credential))
})
test('server roster errors remain stable and never reveal the backend failure',async()=>{
 const request=new Request('https://portal.test/',{headers:{Authorization:'Bearer '+'a'.repeat(64)}}),id='s_'+'1'.repeat(32)
 for(const [code,status]of [['invalid_credential',401],['rate_limited',429],['online_session_unavailable',409]]){
  const response=await gameServerSession(request,id,{call:async()=>({error:{code}})})
  assert.equal(response.status,status);assert.deepEqual(await response.json(),{error:{code}})
 }
 const response=await gameServerSession(request,id,{call:async()=>{throw Error('private SQL credential detail')}})
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'service_unavailable'}})
})

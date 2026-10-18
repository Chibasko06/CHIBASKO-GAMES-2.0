import test from 'node:test'
import assert from 'node:assert/strict'
import {multiplayerLobbyService,privateLobbyCode} from '../lib/multiplayer-lobby/service.ts'
import {multiplayerRequest} from '../lib/server/multiplayerLobbies.ts'
import {LobbyError} from '../lib/multiplayer-lobby/contracts.ts'
import {uploadRepository} from '../lib/game-distribution/uploads/repository.ts'
import {multiplayerLifecycle} from '../lib/server/multiplayerLifecycle.ts'
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
test('request identity is verified server-side; browser owner/user IDs are rejected',async()=>{
 const denied={async actor(){throw new LobbyError('unauthorized',401)},service(){throw Error('must not resolve service')}}
 assert.equal((await multiplayerRequest(new Request('https://portal.test/api/multiplayer/lobbies/'+id),['lobbies',id],denied)).status,401)
 let calls=0
 const deps={async actor(){return actor},service(){return {create(){calls++}}}}
 const response=await multiplayerRequest(new Request('https://portal.test/api/multiplayer/lobbies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({gameId:id,access:'public',requestId:id,userId:id})}),['lobbies'],deps)
 assert.equal(response.status,400);assert.equal(calls,0)
})
test('rate limits commit before mutations; no code key or actor is taken from client state',async()=>{
 const calls=[],service=multiplayerLobbyService({async call(name,args){calls.push({name,args});return name.endsWith('_limit')?true:{id}}})
 await service.joinCode(actor,id,'  abcdef123456abcdef12 ')
 assert.equal(calls[0].args.p_operation,'lookup');assert.equal(calls[1].args.p_code,'ABCDEF123456ABCDEF12');assert.equal(calls[1].args.p_actor,actor)
 assert.throws(()=>privateLobbyCode('../anything'))
 await assert.rejects(service.mutate(actor,id,'join_code'))
})
test('stable database errors are mapped without SQL, keys or stacks',async()=>{
 const db=uploadRepository('https://database.test','fixture-service-key',async()=>Response.json({message:'lobby_full',detail:'private'},{status:400}))
 await assert.rejects(db.call('distribution_multiplayer_mutate',{}),error=>error.code==='lobby_full'&&error.status===409&&!error.message.includes('private'))
 const deps={async actor(){return actor},service(){throw Error('PRIVATE DATABASE ERROR')}}
 const response=await multiplayerRequest(new Request('https://portal.test/'),['lobbies',id],deps)
 assert.equal(await response.text(),'{"error":{"code":"service_unavailable"}}')
})
test('quota failure prevents any mutation',async()=>{
 const calls=[],service=multiplayerLobbyService({async call(name){calls.push(name);return false}})
 await assert.rejects(service.create(actor,id,'public',id),e=>e.code==='rate_limited')
 assert.deepEqual(calls,['distribution_multiplayer_limit'])
})
test('server lifecycle hashes credentials; a browser cannot report authoritative results',async()=>{
 const session='s_'+'1'.repeat(32),credential='7'.repeat(64),calls=[]
 const request=token=>new Request('https://portal.test/api/game-server/v1/sessions/'+session+'/lifecycle',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{"event":"results"}'})
 assert.equal((await multiplayerLifecycle(request('portal-user-token'),session)).status,401)
 const result=await multiplayerLifecycle(request(credential),session,{async call(name,args){calls.push({name,args});return {data:{accepted:true}}}})
 assert.equal(result.status,200);assert.notEqual(calls[0].args.p_credential_hash,credential)
 assert.equal(calls[0].args.p_event,'results');assert.ok(!JSON.stringify(calls).includes(credential))
})

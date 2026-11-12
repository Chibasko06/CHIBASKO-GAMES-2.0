import test from 'node:test'
import assert from 'node:assert/strict'
import {externalGameLaunchRequest,publicExternalGameKind} from '../lib/server/externalGamePlayer.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
import {externalFramePolicy} from '../lib/game-runtime/iframePolicy.ts'

const revisionId='ef400000-0000-4000-8000-000000000005'
const gameId='ef400000-0000-4000-8000-000000000003'
const owner='ef400000-0000-4000-8000-000000000002'
const url='https://play.example.com/game'
const descriptor={kind:'external',revisionId,url}
const request=new Request('https://chibaskogames.fr/preview?url=https://ignored.example.com')

test('private preview obtains the exact authorized revision and projects only URL and revision ID',async()=>{
 const calls=[]
 const deps={authenticate:async()=>owner,db:()=>({call:async(name,args)=>{calls.push([name,args]);return {...descriptor,controlToken:'fixture-private'}}})}
 const response=await externalGameLaunchRequest(request,revisionId,'private',deps)
 assert.equal(response.status,200)
 assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.deepEqual(await response.json(),{data:{revisionId,url}})
 assert.deepEqual(calls,[['distribution_external_preview',{p_actor:owner,p_revision:revisionId}]])
 assert.equal(externalFramePolicy(url).sandbox,'allow-scripts allow-pointer-lock')
})

test('private preview rejects anonymous, unauthorized and mismatched revisions',async()=>{
 const anonymous={authenticate:async()=>{throw new UploadError('unauthorized',401)},db:()=>assert.fail()}
 assert.equal((await externalGameLaunchRequest(request,revisionId,'private',anonymous)).status,401)
 const db=call=>({authenticate:async()=>owner,db:()=>({call})})
 assert.equal((await externalGameLaunchRequest(request,revisionId,'private',db(async()=>{throw new UploadError('game_not_found',404)}))).status,404)
 assert.equal((await externalGameLaunchRequest(request,revisionId,'private',db(async()=>({...descriptor,revisionId:gameId})))).status,404)
})

test('public launch projects only external decisions and never uses legacy as a fallback',async()=>{
 for(const kind of ['legacy','unavailable','external']){
   const db={call:async(name,args)=>{
     assert.equal(name,'distribution_external_public_launch')
     assert.deepEqual(args,{p_game:gameId})
     return {...descriptor,kind}
   }}
   const response=await externalGameLaunchRequest(request,gameId,'public',{authenticate:async()=>assert.fail(),db:()=>db})
   assert.equal(response.status,kind==='external'?200:404)
   assert.equal(await publicExternalGameKind(gameId,db),kind)
 }
})

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {processAccountDeletion,accountDeletionAuth} from '../lib/game-distribution/account-deletion.ts'
import {accountCleanup} from '../lib/game-distribution/account-cleanup.ts'
import {requestAccountDeletion} from '../lib/server/accountDeletion.ts'

const user='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222'
test('le flag désactivé interdit toute création ou reprise depuis le portail',async()=>{
 const before=process.env.GAME_ACCOUNT_DELETIONS_ENABLED
 try{
  for(const value of ['0',undefined]){
   if(value===undefined)delete process.env.GAME_ACCOUNT_DELETIONS_ENABLED;else process.env.GAME_ACCOUNT_DELETIONS_ENABLED=value
   const response=await requestAccountDeletion(user,user,{db:{call(){assert.fail('Aucune RPC autorisée')}},auth:{exists(){assert.fail()},remove(){assert.fail()}},cleanup(){assert.fail()}})
   assert.equal(response.status,503)
  }
 }finally{if(before===undefined)delete process.env.GAME_ACCOUNT_DELETIONS_ENABLED;else process.env.GAME_ACCOUNT_DELETIONS_ENABLED=before}
})
function saga(){
 const state={phase:'pending',exists:true,busy:false,transfers:0,authCalls:0,done:false,calls:[],logs:[],failAuth:false,ambiguous:false}
 const deps={db:{async call(name,args){
  state.calls.push(name)
  if(name==='distribution_account_claim'){if(state.busy||state.phase==='completed')return null;state.busy=true;return {id,target:user,state:state.phase,lease:'lease'}}
  if(name==='distribution_account_prepare'){state.transfers++;return state.phase='prepared'}
  if(name==='distribution_account_auth_deleted'){assert.equal(state.exists,false);state.phase='cleanup_pending';return}
  if(name==='distribution_account_cleanup_next')return state.done?null:{id:'task',kind:'avatars',key:'avatars/'+user+'/',owner:user,lease:'lease'}
  if(name==='distribution_account_cleanup_ack'){state.done=true;return}
  if(name==='distribution_account_release'){state.busy=false;if(args.p_error===null&&state.done)state.phase='completed';return {id,state:state.phase}}
  throw Error('RPC inattendue')
 }},auth:{async exists(){return state.exists},async remove(){state.authCalls++;if(state.failAuth)throw Error('private auth token');state.exists=false;if(state.ambiguous)throw Error('private response')}},
 async cleanup(){return {done:true,cursor:null}},log:event=>state.logs.push(event)}
 return {state,deps}
}

test('un échec Auth conserve la préparation et la reprise ne transfère pas deux fois',async()=>{
 const {state,deps}=saga();state.failAuth=true
 assert.equal((await processAccountDeletion(deps,id)).state,'prepared')
 assert.equal(state.exists,true);assert.equal(state.done,false)
 state.failAuth=false
 assert.equal((await processAccountDeletion(deps,id)).state,'completed')
 assert.equal(state.transfers,1);assert.equal(state.authCalls,2)
 assert.doesNotMatch(JSON.stringify(state.logs),/private|token|11111111/)
})
test('une réponse Auth ambiguë est réconciliée par lecture avant toute répétition',async()=>{
 const {state,deps}=saga();state.ambiguous=true
 await processAccountDeletion(deps,id);assert.equal(state.exists,false)
 assert.equal((await processAccountDeletion(deps,id)).state,'completed')
 assert.equal(state.authCalls,1)
 assert.equal(await processAccountDeletion(deps,id),null)
})
test('deux consommateurs ne traitent pas la même demande simultanément',async()=>{
 const {state,deps}=saga()
 const results=await Promise.all([processAccountDeletion(deps,id),processAccountDeletion(deps,id)])
 assert.equal(results.filter(Boolean).length,1);assert.equal(state.transfers,1);assert.equal(state.authCalls,1)
})
test('un échec R2 laisse la suppression incomplète sans répéter Auth',async()=>{
 const {state,deps}=saga(),cleanup=deps.cleanup
 deps.cleanup=async()=>{throw Error('private bucket key')}
 assert.equal((await processAccountDeletion(deps,id)).state,'cleanup_pending')
 assert.equal(state.exists,false);assert.equal(state.done,false)
 deps.cleanup=cleanup
 assert.equal((await processAccountDeletion(deps,id)).state,'completed');assert.equal(state.authCalls,1)
})
test('le client Auth distingue une identité absente d’une panne ou d’une mauvaise URL',async()=>{
 const env={SUPABASE_URL:'https://database.example',SUPABASE_SERVICE_ROLE_KEY:'private-fixture'}
 assert.equal(await accountDeletionAuth(env,async()=>Response.json({code:'user_not_found'},{status:404})).exists(user),false)
 for(const status of [401,404,500])await assert.rejects(accountDeletionAuth(env,async()=>Response.json({code:'private'},{status})).exists(user))
})
test('une requête de suppression ne déclare pas une demande en revue comme terminée',async()=>{
 process.env.GAME_ACCOUNT_DELETIONS_ENABLED='1'
 try{
  const {deps}=saga();deps.db.call=async name=>{assert.equal(name,'distribution_account_request');return {id,state:'review_required'}}
  const response=await requestAccountDeletion(user,user,deps)
  assert.equal(response.status,202);assert.equal((await response.json()).success,false)
 }finally{delete process.env.GAME_ACCOUNT_DELETIONS_ENABLED}
})
test('la route personnelle vérifie Auth et ignore une cible fournie dans le corps',async t=>{
 const {DELETE}=await import('../app/api/account/route.ts')
 assert.equal((await DELETE(new Request('https://site.example/api/account',{method:'DELETE'}))).status,401)
 const names=['GAME_ACCOUNT_DELETIONS_ENABLED','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY']
 const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]))
 Object.assign(process.env,{GAME_ACCOUNT_DELETIONS_ENABLED:'1',NEXT_PUBLIC_SUPABASE_URL:'https://db.example',NEXT_PUBLIC_SUPABASE_ANON_KEY:'fixture-public',SUPABASE_SERVICE_ROLE_KEY:'fixture-private'})
 const requests=[]
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const path=new URL(input).pathname
  if(path==='/auth/v1/user')return Response.json({id:user,email:'fixture@example.test'})
  assert.equal(path,'/rest/v1/rpc/distribution_account_request')
  requests.push(JSON.parse(init.body));return Response.json({id,state:'review_required'})
 })
 try{
  const response=await DELETE(new Request('https://site.example/api/account',{method:'DELETE',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({target:id})}))
  assert.equal(response.status,202);assert.deepEqual(requests,[{p_actor:user,p_target:user}])
  assert.doesNotMatch(await response.text(),/fixture-private|fixture-public|email|multipart|lease|staging/)
 }finally{for(const name of names)if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name]}
})

function assets(){
 const deleted=[],calls=[],key='avatars/'+user+'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
 const bucket={async head(k){return {key:k,customMetadata:{application:'chibasko-games',kind:'avatars',userId:user}}},
  async delete(k){deleted.push(k)},async list(){return {objects:[{key}],truncated:false}}}
 const db={async call(name,args){calls.push({name,args});return true}}
 const task={id,lease:'lease',kind:'avatars',key:'avatars/'+user+'/',owner:user,cursor:null,multipart:null}
 return {bucket,db,task,key,deleted,calls}
}
test('le nettoyage réserve l’asset avant sa suppression et conserve les objets référencés',async()=>{
 const h=assets(),clean=accountCleanup(h.db,{CHIBASKO_ASSETS:h.bucket})
 assert.equal((await clean(h.task)).done,true);assert.deepEqual(h.deleted,[h.key])
 assert.equal(h.calls[0].name,'distribution_account_reserve_asset')
 h.deleted.length=0;h.db.call=async()=>false
 await accountCleanup(h.db,{CHIBASKO_ASSETS:h.bucket})(h.task);assert.deepEqual(h.deleted,[])
})
test('une clé arbitraire ou une provenance R2 non vérifiée ne permet aucune suppression',async()=>{
 const h=assets(),clean=accountCleanup(h.db,{CHIBASKO_ASSETS:h.bucket})
 for(const key of ['../other','avatars/'+id+'/','game-thumbnails/arbitrary'])await assert.rejects(clean({...h.task,key}))
 h.bucket.head=async()=>({customMetadata:{application:'other'}})
 await assert.rejects(accountCleanup(h.db,{CHIBASKO_ASSETS:h.bucket})(h.task));assert.deepEqual(h.deleted,[])
})
test('le curseur R2 est conservé et un résultat hors du préfixe est refusé',async()=>{
 const h=assets()
 h.bucket.list=async()=>({objects:[{key:h.key}],truncated:true,cursor:'next'})
 assert.deepEqual(await accountCleanup(h.db,{CHIBASKO_ASSETS:h.bucket})(h.task),{done:false,cursor:'next'})
 h.bucket.list=async()=>({objects:[{key:'other/object'}],truncated:false})
 await assert.rejects(accountCleanup(h.db,{CHIBASKO_ASSETS:h.bucket})(h.task))
})
test('le staging n’accepte que les clés d’upload et reprend un abort déjà effectué',async()=>{
 const h=assets(),key='staging/uploads/'+id+'/source.zip'
 h.bucket.resumeMultipartUpload=()=>({async abort(){throw {code:'NoSuchUpload'}}})
 const clean=accountCleanup(h.db,{GAME_BUILDS_STAGING:h.bucket})
 await clean({...h.task,kind:'staging',key,multipart:'private-multipart'})
 await assert.rejects(clean({...h.task,kind:'staging',key:'games/'+id+'/'}))
 assert.deepEqual(h.deleted,[key])
})

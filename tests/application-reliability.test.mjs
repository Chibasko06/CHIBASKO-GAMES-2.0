import {test,beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {readData,DataAccessError} from '../lib/dataAccess.ts'
import {getGamesCatalog,getGameBySlug,getGameReviews,getCategories,getGamePublicStats} from '../lib/queries/games.ts'
import {getPublicProfiles,getPublicProfileById,getPublicProfileSummary} from '../lib/queries/profiles.ts'
import {getFavoriteGames,isFavorite} from '../lib/queries/favorites.ts'
import {getRecentPlayHistory} from '../lib/queries/history.ts'
import {getPublishedFaqEntries} from '../lib/queries/faq.ts'
import {PATCH as profile} from '../app/api/profile/public/route.ts'
import {POST as sync} from '../app/api/profile/sync/route.ts'
import {POST as retired} from '../app/api/game-submissions/route.ts'
import {POST as create} from '../app/api/admin/games/route.ts'
import {PATCH as update} from '../app/api/admin/games/[id]/route.ts'
import {toCsv} from '../lib/server/csv.ts'
import sitemap from '../app/sitemap.ts'

const user='11111111-1111-4111-8111-111111111111'
let failure,events,logs,rows
beforeEach(t=>{
  failure=null;events=[];logs=[];rows=[]
  const chain={select(){return chain},eq(){return chain},order(){return chain},limit(){return chain},range(){return chain},
    update(fields){events.push(['update',fields]);return chain},insert(fields){events.push(['insert',fields]);return chain},
    async maybeSingle(){return {data:rows[0]??null,error:failure}},
    async single(){return {data:{id:user,username:'Player'},error:failure}},
    then(resolve,reject){return Promise.resolve({data:rows,count:rows.length,error:failure}).then(resolve,reject)}}
  const db={from(){return chain},rpc(name,args){events.push(['rpc',name,args]);if(name==='distribution_account_access')return Promise.resolve({data:true,error:failure});if(name==='catalogue_page')return Promise.resolve({data:{items:rows,total:rows.length},error:failure});return chain},
    auth:{async getUser(){return {data:{user:{id:user,user_metadata:{}}},error:null}}}}
  globalThis.__reliability={db}
  globalThis.__phase0={admin:db}
  globalThis.__r2={adminCheck:async()=>({supabaseAdmin:db,user:{id:user}})}
  t.mock.method(console,'error',value=>logs.push(value))
})
const request=(body,method='PATCH')=>new Request('https://site.example/api/profile/public',{
  method,headers:{Authorization:'Bearer fixture-private-token','Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)})

test('all public reads preserve empty success and reject database errors rather than empty states',async()=>{
  const lists=[getGamesCatalog,getCategories,getGamePublicStats,getGameReviews,getPublicProfiles,getFavoriteGames,getRecentPlayHistory,getPublishedFaqEntries]
  for(const read of lists){assert.deepEqual(await read(user),[]);failure={code:'08006',message:'private credential URL'};await assert.rejects(read(user),e=>e instanceof DataAccessError&&e.kind==='database_unavailable');failure=null}
  assert.equal(await getGameBySlug('missing'),null)
  assert.equal(await getPublicProfileById(user),null)
  assert.equal(await isFavorite(user,user),false)
  assert.deepEqual(await getPublicProfileSummary(user),{favoriteCount:0,commentCount:0})
  failure={code:'XX000',message:'private SQL details'}
  for(const read of [()=>getGameBySlug('missing'),()=>getPublicProfileById(user),()=>isFavorite(user,user),()=>getPublicProfileSummary(user),sitemap])await assert.rejects(read(),DataAccessError)
  assert.doesNotMatch(logs.join(' '),/private|credential|11111111/)
  assert.ok(logs.every(line=>JSON.parse(line).requestId))
})

test('transport and unexpected exceptions have distinct safe diagnoses',async()=>{
  for(const [error,kind]of [[new TypeError('secret URL'),'database_unavailable'],[new Error('secret stack'),'unexpected_error']]){
    await assert.rejects(readData('fixture',Promise.reject(error)),e=>e.kind===kind&&!e.message.includes('secret'))
  }
  assert.doesNotMatch(logs.join(' '),/secret/)
})

test('les réponses personnelles concurrentes restent liées au compte authentifié et interdites au cache partagé',async()=>{
 const profiles=new Map([['actor-a',{id:'actor-a',username:'alpha',display_name:'Privé A'}],['actor-b',{id:'actor-b',username:'beta',display_name:'Privé B'}]])
 const reads=[]
 globalThis.__reliability.db=globalThis.__phase0.admin={rpc:async()=>({data:true,error:null}),auth:{async getUser(token){return {data:{user:{id:token}},error:null}}},from(table){
  assert.equal(table,'profiles');let fields,actor
  return {update(value){fields=value;return this},eq(key,value){assert.equal(key,'id');actor=value;return this},select(){return this},async single(){reads.push(actor);return {data:{...profiles.get(actor),...fields},error:null}}}
 }}
 const responses=await Promise.all(['actor-a','actor-b'].map((actor,index)=>profile(new Request('https://site.example/api/profile/public',{
  method:'PATCH',headers:{Authorization:'Bearer '+actor,'Content-Type':'application/json'},body:JSON.stringify({username:index?'beta':'alpha',bio:null})
 }))))
 for(const [index,response] of responses.entries()){
  assert.equal(response.status,200)
  assert.match(response.headers.get('cache-control'),/no-store/)
  assert.equal((await response.json()).profile.id,index?'actor-b':'actor-a')
 }
 assert.deepEqual(reads.sort(),['actor-a','actor-b'])
})

test('profile input rejects malformed, oversized, unknown and mistyped fields before any update',async()=>{
  for(const [body,status]of [['{',400],['',400],[null,400],[[],400],[{username:''},400],[{username:'x'.repeat(33)},400],
    [{username:'Player',bio:42},400],[{username:'Player',bio:'x'.repeat(17000)},413],[{username:'Player',bio:'a\0b'},400],
    [{username:'Player',avatar_url:'https://attacker.example'},400],[{username:'Player',id:user},400]]){
    const response=await profile(request(body));assert.equal(response.status,status,JSON.stringify(body)?.slice(0,80))
    assert.match(response.headers.get('cache-control'),/no-store/)
  }
  assert.deepEqual(events.filter(([kind,name])=>kind!=='rpc'||name!=='distribution_account_access'),[])
  for(const bio of [null,'',' Bonjour '])assert.equal((await profile(request({username:' Player ',bio}))).status,200)
  assert.equal(events.at(-1)[1].username,'player')
})

test('profile auth/database failures are private and sync never treats a failed lookup as absence',async()=>{
  failure={code:'XX000',message:'private SQL with service_role'}
  for(const invoke of [()=>profile(request({username:'Player'})),()=>sync(request(undefined,'POST'))]){
    const response=await invoke();assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/SQL|service_role|XX000/)
  }
  assert.ok(!events.some(([kind])=>kind==='insert'))
  globalThis.__reliability.db.auth.getUser=async()=>({data:{user:null},error:{status:401,message:'private JWT'}})
  const expired=await profile(request({username:'Player'}));assert.equal(expired.status,401);assert.doesNotMatch(await expired.text(),/JWT/)
  globalThis.__reliability.db.auth.getUser=async()=>{throw new TypeError('private auth transport')}
  assert.equal((await profile(request({username:'Player'}))).status,503)
})

test('retired anonymous endpoint never initializes privileged storage for any payload',async()=>{
  globalThis.__phase0.admin=new Proxy({}, {get(){throw Error('privileged access')}})
  for(const body of [{}, {game_title:'Game',ownership_confirmed:true},'{']){
    const response=await retired(request(body,'POST'));assert.equal(response.status,410);assert.equal((await response.json()).error.code,'submission_endpoint_retired')
  }
  assert.deepEqual(events,[])
})

test('catalogue routes authorize before RPC and use one transactional mutation',async()=>{
  const payload={title:'Game',slug:'game',game_url:'https://game.example',category_ids:[]}
  const req=()=>request(payload,'POST')
  globalThis.__r2.adminCheck=async()=>({error:new Response(null,{status:403})})
  assert.equal((await create(req())).status,403);assert.equal(events.length,0)
  globalThis.__r2.adminCheck=async()=>({supabaseAdmin:globalThis.__reliability.db,user:{id:user}})
  globalThis.__reliability.db.rpc=async(name,args)=>{events.push(['rpc',name,args]);return{data:{game:{id:user,thumbnail_url:null},previousThumbnail:null},error:failure}}
  assert.equal((await create(req())).status,200)
  rows=[{id:user,thumbnail_url:null}]
  assert.equal((await update(request(payload),{params:Promise.resolve({id:user})})).status,200)
  assert.equal(events.length,2);assert.ok(events.every(([,name,args])=>name==='admin_save_game'&&args.p_actor===user))
  failure={code:'22023',message:'private invalid category'}
  const rejected=await create(req());assert.equal(rejected.status,400);assert.doesNotMatch(await rejected.text(),/private/)
})

test('CSV neutralizes formulas including whitespace prefixes while preserving quoting, accents and line breaks',()=>{
  for(const value of ['=1+1','+SUM(A1:A2)','-1+2','@SUM(A1:A2)','  =1','\t=1','\r=1'])assert.equal(toCsv([{value}]),'"value"\n"\''+value+'"')
  assert.equal(toCsv([{value:'texte normal'}]),'"value"\n"texte normal"')
  assert.equal(toCsv([{value:'texte, avec virgule'}]),'"value"\n"texte, avec virgule"')
  assert.equal(toCsv([{value:'Été "test"\nligne'}]),'"value"\n"Été ""test""\nligne"')
  const row={value:'=1+1'};toCsv([row]);assert.equal(row.value,'=1+1')
})

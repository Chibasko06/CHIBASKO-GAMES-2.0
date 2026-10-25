import {test,beforeEach} from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {requireAdmin} from '../app/api/admin/_utils.ts'
import {proxy} from '../proxy.ts'
import AdminLayout from '../app/admin/layout.tsx'
import {NextRequest} from './admin-next.mjs'

const ids={normal:'00000000-0000-4000-8000-000000000001',admin:'00000000-0000-4000-8000-000000000002'}
const fixtureExpiry=Math.floor(Date.now()/1000)+3600
const token=role=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:ids[role],exp:fixtureExpiry,aud:'authenticated'})).toString('base64url')+'.fixture-signature'
let calls,queries,membershipFailure
const privileged={async rpc(name,args){calls.push(name);return {data:{game:{id:'fixture',thumbnail_url:null,...args.p_game},previousThumbnail:null},error:null}},from(table){calls.push(table);let payload={};const q={select(){return q},order(){return q},range(){return q},eq(){return q},is(){return q},delete(){return q},insert(p){payload=p;return q},update(p){payload=p;return q},async single(){return{data:{id:'fixture',thumbnail_url:null,...payload},error:null}},async maybeSingle(){return{data:{id:'fixture',thumbnail_url:null,...payload},error:null}},then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve)}};return q},auth:{admin:{async listUsers(){calls.push('auth-users');return{data:{users:[]},error:null}}}}}
beforeEach(t=>{
  calls=[];queries=[];membershipFailure=false
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://mock.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='public-test-key'
  globalThis.__phase0={admin:privileged}
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const url=new URL(String(input)),bearer=new Headers(init?.headers).get('authorization')?.slice(7)
    const role=Object.keys(ids).find(r=>token(r)===bearer)
    queries.push(url.pathname)
    if(url.pathname.endsWith('/user'))return role?Response.json({id:ids[role],email:'irrelevant@example.invalid',user_metadata:{role:'admin',is_admin:true}}):Response.json({message:'Invalid token'},{status:401})
    if(url.pathname.includes('/admin_users')){
      if(membershipFailure)return Response.json({message:'private database detail'},{status:500})
      assert.equal(url.searchParams.get('user_id'),'eq.'+ids[role])
      assert.equal(init.cache,'no-store')
      return Response.json(role==='admin'?[{user_id:ids.admin}]:[])
    }
    throw Error('Unexpected test request')
  })
})
const request=(role,method='GET',path='/api/admin/games',origin)=>new NextRequest('https://site.example'+path,{method,headers:{...(role?{Authorization:'Bearer '+(role==='invalid'?'invalid':token(role))}:{}),...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},...(!['GET','HEAD'].includes(method)?{body:JSON.stringify({title:'Fixture',slug:'fixture',game_url:'https://game.example'})}:{})})

test('les jetons de fixture restent identiques pendant les échanges réseau',t=>{
 const issued=token('normal'),now=Date.now()
 t.mock.method(Date,'now',()=>now+2000)
 assert.equal(token('normal'),issued)
})

test('real API guard requires validated authentication and DB membership, ignoring email/metadata',async()=>{
  for(const[role,status]of[[null,401],['invalid',401],['normal',403]]){
    const r=await requireAdmin(request(role));assert.equal(r.error.status,status);assert.match(r.error.headers.get('cache-control'),/private.*no-store/)
  }
  assert.equal(calls.length,0)
  const admin=await requireAdmin(request('admin'));assert.equal(admin.user.id,ids.admin);assert.equal(admin.supabaseAdmin,privileged)
  membershipFailure=true;assert.equal((await requireAdmin(request('admin'))).error.status,503)
})

test('cookie alone never authorizes writes; supplied cross-origin and cross-site requests are refused',async()=>{
  const cookieOnly=request(null,'POST');cookieOnly.headers.set('cookie','is_admin=true; role=admin')
  assert.equal((await requireAdmin(cookieOnly)).error.status,401)
  assert.equal((await requireAdmin(request('admin','POST',undefined,'https://evil.example'))).error.status,403)
  const cross=request('admin','POST');cross.headers.set('sec-fetch-site','cross-site');assert.equal((await requireAdmin(cross)).error.status,403)
  assert.equal((await requireAdmin(request('admin','POST',undefined,'https://site.example'))).user.id,ids.admin)
  assert.equal((await requireAdmin(request('admin','POST'))).user.id,ids.admin)
})

test('all admin handlers deny anonymous and normal users before any private CRUD or upload',async()=>{
  async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory())out.push(...await files(new URL(e.name+'/',dir)));else if(e.name==='route.ts')out.push(new URL(e.name,dir))}return out}
  let methods=0
  for(const file of await files(new URL('../app/api/admin/',import.meta.url))){
    const handler=await import(file.href)
    for(const method of ['GET','POST','PATCH','DELETE'])if(handler[method]){
      for(const role of [null,'normal']){
        const res=await handler[method](request(role,method),{params:Promise.resolve({id:'fixture',entity:'games'})})
        if(file.href.includes('/status/'))assert.equal((await res.json()).isAdmin,false)
        assert.equal(res.status,role?403:401)
        assert.match(res.headers.get('cache-control'),/no-store/)
      }
      methods++
    }
  }
  assert.ok(methods>=20);assert.deepEqual(calls,[])
})

test('admin status distinguishes missing session, revoked role and backend failure without private detail',async()=>{
  const{GET}=await import('../app/api/admin/status/route.ts')
  for(const[role,status]of[[null,401],['normal',403],['admin',200]]){
    const response=await GET(request(role))
    assert.equal(response.status,status);assert.deepEqual(await response.json(),{isAdmin:role==='admin'})
    assert.match(response.headers.get('cache-control'),/private.*no-store/)
  }
  membershipFailure=true
  const failed=await GET(request('admin'))
  assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{isAdmin:false})
})

test('admin creates, edits and publishes through real guard; unsafe identifiers, unknown fields and SQL errors stay private',async t=>{
  const{POST}=await import('../app/api/admin/games/route.ts'),{PATCH}=await import('../app/api/admin/games/[id]/route.ts')
  assert.equal((await POST(request('admin','POST'))).status,200)
  const multi={title:'Fixture',slug:'fixture',game_type:'multiplayer_chibasko',game_url:null,multiplayer_game_id:'chibasko-pong',is_published:true,is_beta:true}
  const req=body=>new NextRequest('https://site.example/api/admin/games/fixture',{method:'PATCH',headers:{Authorization:'Bearer '+token('admin'),'Content-Type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await PATCH(req(multi),{params:Promise.resolve({id:'fixture'})})).status,200)
  const before=calls.length
  for(const change of [{multiplayer_game_id:'../engine'},{roomType:'evil'},{game_url:'https://evil.example'}])assert.equal((await PATCH(req({...multi,...change}),{params:Promise.resolve({id:'fixture'})})).status,400)
  assert.equal(calls.length,before)
  t.mock.method(privileged,'rpc',async()=>({data:null,error:{code:'XX000',message:'private SQL detail'}}))
  const failed=await POST(request('admin','POST'))
  assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private SQL detail|XX000/)
})

test('malformed JSON and invalid profile field types return safe errors before privileged writes',async()=>{
  const{PATCH}=await import('../app/api/admin/users/[id]/route.ts')
  for(const body of ['{',JSON.stringify({username:'Fixture',avatar_url:{unexpected:true}}),JSON.stringify({username:'Fixture',bio:42})]){
    const req=new NextRequest('https://site.example/api/admin/users/fixture',{method:'PATCH',headers:{Authorization:'Bearer '+token('admin'),'Content-Type':'application/json'},body})
    const response=await PATCH(req,{params:Promise.resolve({id:ids.normal})})
    assert.equal(response.status,400);assert.equal(typeof (await response.json()).error,'string')
  }
  assert.deepEqual(calls,[])
})

function pageRequest(role,path='/admin'){
  const r=new NextRequest('https://site.example'+path)
  if(role)r.cookies.set('sb-mock-auth-token','base64-'+Buffer.from(JSON.stringify({access_token:token(role),refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:ids[role]}})).toString('base64url'))
  return r
}

test('la recherche administrative et les badges utilisent les paramètres serveur validés',async()=>{
 const {GET}=await import('../app/api/admin/users/route.ts');const reads=[]
 globalThis.__phase0.admin={rpc:async(name,args)=>{reads.push({name,args});return {data:{users:[],total:0},error:null}}}
 const response=await GET(request('admin','GET','/api/admin/users?page=2&search=Studio%20%25_&role=developer'))
 assert.equal(response.status,200)
 assert.deepEqual(reads,[{name:'admin_console_users',args:{p_actor:ids.admin,p_offset:50,p_limit:50,p_search:'Studio %_',p_role:'developer'}}])
 for(const query of ['role=owner','search='+ 'a'.repeat(81)])assert.equal((await GET(request('admin','GET','/api/admin/users?'+query))).status,400)
 assert.equal(reads.length,1)
})

test('les filtres du catalogue sont exécutés avant la pagination et échappent les motifs',async()=>{
 const {GET}=await import('../app/api/admin/games/route.ts');const operations=[]
 globalThis.__phase0.admin={from(table){operations.push(['from',table]);const q={select(){return q},ilike(...args){operations.push(['ilike',...args]);return q},eq(...args){operations.push(['eq',...args]);return q},order(...args){operations.push(['order',...args]);return q},async range(...args){operations.push(['range',...args]);return {data:[],count:0,error:null}}};return q}}
 const response=await GET(request('admin','GET','/api/admin/games?page=2&search=50%25_&status=published&type=classic'))
 assert.equal(response.status,200)
 assert.ok(operations.some(item=>item[0]==='ilike'&&item[1]==='title'&&item[2]==='%50\\%\\_%'))
 assert.ok(operations.some(item=>item[0]==='eq'&&item[1]==='is_published'&&item[2]===true))
 assert.deepEqual(operations.at(-1),['range',50,99])
 assert.equal((await GET(request('admin','GET','/api/admin/games?status=unsafe'))).status,400)
})

test('les compteurs et la liste de suppressions restent privés et échouent sans inventer de données',async()=>{
 const {GET:overview}=await import('../app/api/admin/overview/route.ts'),{GET:deletions}=await import('../app/api/admin/account-deletions/route.ts')
 const metrics={games:53,publishedGames:27,users:103,buildsAwaitingReview:2,buildsAwaitingValidation:1,deletionsAwaitingReview:1,deletionsBlocked:0,notificationsBlocked:0};let last
 globalThis.__phase0.admin={rpc:async(name,args)=>{last={name,args};return {data:name==='admin_console_overview'?{...metrics,internal:'private'}:{deletions:[],total:0},error:null}}}
 const response=await overview(request('admin','GET','/api/admin/overview'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{overview:metrics})
 assert.equal(last.name,'admin_console_overview');assert.deepEqual(last.args,{p_actor:ids.admin})
 assert.equal((await deletions(request('admin','GET','/api/admin/account-deletions?page=2&state=attention'))).status,200)
 assert.deepEqual(last,{name:'admin_console_deletions',args:{p_actor:ids.admin,p_state:'attention',p_offset:50,p_limit:50}})
 globalThis.__phase0.admin.rpc=async()=>({data:null,error:{code:'08006',message:'private SQL'}})
 for(const route of [overview,deletions]){const failed=await route(request('admin'));assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private SQL/)}
})

test('la modification administrative refuse les rôles, tailles et URL dangereux avant toute écriture',async()=>{
 const {PATCH}=await import('../app/api/admin/users/[id]/route.ts')
 for(const body of [{username:''},{username:'x'.repeat(33)},{username:'Valide',bio:'x'.repeat(16385)},
  {username:'Valide',is_admin:true},{username:'Valide',avatar_url:'javascript:alert(1)'},
  {username:'Valide',avatar_url:'https://user:password@example.test/avatar.png'},
  {username:'Valide',expected:{username:'Ancien'}}]){
  const req=new NextRequest('https://site.example/api/admin/users/'+ids.normal,{method:'PATCH',headers:{Authorization:'Bearer '+token('admin'),'Content-Type':'application/json'},body:JSON.stringify(body)})
  const result=await PATCH(req,{params:Promise.resolve({id:ids.normal})})
  assert.ok([400,413].includes(result.status));assert.doesNotMatch(await result.text(),/password|SQL|credential/)
 }
 assert.deepEqual(calls,[])
})

test('la liste administrative borne la page, protège les données et distingue une panne du vide',async()=>{
 const {GET}=await import('../app/api/admin/users/route.ts');let args
 globalThis.__phase0.admin={rpc:async(name,input)=>{assert.equal(name,'admin_console_users');args=input;return {data:{users:[],total:0},error:null}}}
 const result=await GET(request('admin','GET','/api/admin/users?page=3'))
 assert.equal(result.status,200);assert.deepEqual(args,{p_actor:ids.admin,p_offset:100,p_limit:50,p_search:'',p_role:'all'})
 assert.deepEqual(await result.json(),{users:[],total:0,page:3,pageSize:50})
 for(const response of [{data:null,error:{code:'08006',message:'private SQL'}},{data:{users:[],total:null},error:null}]){
  globalThis.__phase0.admin.rpc=async()=>response
  const failed=await GET(request('admin'));assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private SQL/)
 }
})

test('la suppression administrative refuse le compte courant et réutilise la demande durable',async t=>{
 const {DELETE}=await import('../app/api/admin/users/[id]/route.ts')
 const previousFlag=process.env.GAME_ACCOUNT_DELETIONS_ENABLED,previousKey=process.env.SUPABASE_SERVICE_ROLE_KEY
 t.after(()=>{for(const [key,value] of [['GAME_ACCOUNT_DELETIONS_ENABLED',previousFlag],['SUPABASE_SERVICE_ROLE_KEY',previousKey]]){if(value===undefined)delete process.env[key];else process.env[key]=value}})
 process.env.GAME_ACCOUNT_DELETIONS_ENABLED='1';process.env.SUPABASE_SERVICE_ROLE_KEY='fixture-server-key'
 const original=globalThis.fetch,requests=[]
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const url=new URL(String(input))
  if(url.pathname==='/rest/v1/rpc/distribution_account_request'){
   requests.push(JSON.parse(init.body));return Response.json({id:'11111111-1111-4111-8111-111111111111',state:'review_required'})
  }
  assert.ok(!url.pathname.includes('/admin/users/'),'Aucune suppression Auth directe depuis la route')
  return original(input,init)
 })
 const own=await DELETE(request('admin','DELETE'),{params:Promise.resolve({id:ids.admin})})
 assert.equal(own.status,403);assert.equal(requests.length,0)
 for(let n=0;n<2;n++){
  const response=await DELETE(request('admin','DELETE'),{params:Promise.resolve({id:ids.normal})})
  assert.equal(response.status,202);assert.equal((await response.json()).deletion.state,'review_required')
 }
 assert.deepEqual(requests,[{p_actor:ids.admin,p_target:ids.normal},{p_actor:ids.admin,p_target:ids.normal}])
 process.env.GAME_ACCOUNT_DELETIONS_ENABLED='0'
 assert.equal((await DELETE(request('admin','DELETE'),{params:Promise.resolve({id:ids.normal})})).status,503)
 assert.equal(requests.length,2)
})
test('server page proxy and layout reject anonymous/normal users, authorize admins and disable public caching',async()=>{
  for(const role of [null,'normal','admin']){
    const r=pageRequest(role,'/admin/future-page'),res=await proxy(r)
    assert.equal(res.status,role===null?307:role==='normal'?404:200)
    assert.match(res.headers.get('cache-control'),/private.*no-store/)
    if(!role){const target=new URL(res.headers.get('location'));assert.equal(target.origin,'https://site.example');assert.equal(target.pathname,'/login');assert.equal(target.searchParams.get('next'),'/admin/future-page')}
    globalThis.__adminCookies=r.cookies
    if(!role)await assert.rejects(AdminLayout({children:'private'}),/REDIRECT/)
    else if(role==='normal')await assert.rejects(AdminLayout({children:'private'}),/NOT_FOUND/)
    else assert.equal(await AdminLayout({children:'private'}),'private')
  }
})
test('membership query failures and forged cookies fail closed without data or credential logs',async t=>{
  const logs=[];for(const method of ['log','warn','error'])t.mock.method(console,method,(...args)=>logs.push(args))
  const r=pageRequest('normal');r.cookies.set('is_admin','true');assert.equal((await proxy(r)).status,404)
  membershipFailure=true;const denied=await proxy(pageRequest('admin'));assert.equal(denied.status,503);assert.doesNotMatch(await denied.text(),/database detail/)
  assert.deepEqual(logs,[])
  for(const path of ['../lib/supabaseAdmin.ts','../lib/server/adminAuthorization.ts'])assert.match(await readFile(new URL(path,import.meta.url),'utf8'),/import 'server-only'/)
})

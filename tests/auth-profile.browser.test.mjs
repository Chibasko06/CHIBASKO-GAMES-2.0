import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'

let browser,script
before(async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import {createRoot} from 'react-dom/client'
 import {AuthProvider} from './components/AuthProvider'
 import {Navbar} from './components/Navbar'
 import Login from './app/login/page'
 import Callback from './app/auth/callback/page'
 createRoot(document.getElementById('root')!).render(<AuthProvider><Navbar/>{location.search.includes('callback')?<Callback/>:<Login/>}</AuthProvider>)
 `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'services-isoles',setup(b){
  b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'db',namespace:'fixture'}))
  b.onResolve({filter:/^next\/(link|image|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),loader:'js',contents:{
   db:'export const supabase=window.fixture.db;export async function restoreBrowserSession(){return (await supabase.auth.getSession()).data.session}',
   link:'import {createElement} from "react";export default function Link({children,prefetch,...props}){return createElement("a",props,children)}',
   image:'import {createElement} from "react";export default function Image({fill,unoptimized,priority,...props}){return createElement("img",props)}',
   navigation:'const router={replace(path){window.fixture.destination=path},push(path){window.fixture.destination=path}};export function useRouter(){return router} export function useSearchParams(){return new URLSearchParams(location.search)}',
  }[path]}))
 }}]})
 script=bundle.outputFiles[0].text
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>{await browser?.close()})

async function setup(view='login',profileStatus=200){
 const context=await browser.newContext(),requests=[]
 await context.addInitScript(()=>{
  const listeners=new Set(),counts={reads:0,signIns:0,profileReads:0}
  let session=null
  const emit=(next)=>{session=next;for(const cb of listeners)cb(next?'SIGNED_IN':'SIGNED_OUT',next)}
  const signIn=()=>emit({access_token:'browser-fixture',user:{id:'A',email:'fixture@example.test'}})
  const db={auth:{async getSession(){counts.reads++;return {data:{session},error:null}},onAuthStateChange(cb){listeners.add(cb);return {data:{subscription:{unsubscribe(){listeners.delete(cb)}}}}},async signInWithPassword(){counts.signIns++;signIn();return {data:{session},error:null}},async signOut(){emit(null);return {error:null}}},from(){return {select(){return this},eq(){return this},abortSignal(){return this},async maybeSingle(){counts.profileReads++;return {data:{avatar_url:null},error:null}}}}}
  window.fixture={db,counts,signIn,signOut:()=>emit(null)}
 })
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(url.pathname==='/api/profile/sync'){
   requests.push(request)
   const valid=request.headers()['content-type']==='application/json'&&request.postData()==='{}'&&request.headers().authorization==='Bearer browser-fixture'
   return route.fulfill({status:valid?profileStatus:415,json:profileStatus===200?{profile:{id:'A'}}:{error:'private provider detail'}})
  }
  if(url.pathname==='/api/social/notifications')return route.fulfill({json:{data:{avatarUrl:null,isAdmin:false,unreadCount:0}}})
  if(url.pathname==='/api/admin/status')return route.fulfill({json:{isAdmin:false}})
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/bundle.js"></script>'})
  return route.fulfill({status:404,body:''})
 })
 const page=await context.newPage();await page.goto('https://portal.test/?view='+view+'&next=%2Fdashboard')
 return {context,page,requests,setStatus(value){profileStatus=value}}
}

test('connexion à froid et Navbar : une requête Auth et une synchronisation profil',async()=>{
 const x=await setup()
 try{
  await x.page.getByRole('button',{name:'Connexion',exact:true}).click()
  await x.page.waitForFunction(()=>window.fixture.destination==='/dashboard')
  assert.equal(x.requests.length,1)
  assert.deepEqual(await x.page.evaluate(()=>window.fixture.counts),{reads:1,signIns:1,profileReads:0})
  assert.equal(await x.page.getByRole('button',{name:'Mon compte',exact:true}).count(),1)
  assert.equal(await x.page.getByText(/profil est indisponible/).count(),0)
  await x.page.evaluate(()=>window.fixture.signOut())
  await x.page.getByRole('link',{name:'Connexion',exact:true}).first().waitFor()
  await x.page.evaluate(()=>window.fixture.signIn())
  await x.page.getByRole('button',{name:'Mon compte',exact:true}).waitFor()
  assert.equal(x.requests.length,1)
 }finally{await x.context.close()}
})

test('callback à froid : erreur réelle, reprise et absence de nouvelle authentification',async()=>{
 const x=await setup('callback',503)
 try{
  await x.page.waitForFunction(()=>window.fixture.counts.reads===2)
  await x.page.evaluate(()=>window.fixture.signIn())
  await x.page.getByRole('button',{name:'Réessayer',exact:true}).waitFor()
  assert.equal(x.requests.length,1)
  assert.equal(await x.page.evaluate(()=>window.fixture.destination),undefined)
  assert.equal(await x.page.getByText('private provider detail',{exact:true}).count(),0)
  x.setStatus(200)
  await x.page.getByRole('button',{name:'Réessayer',exact:true}).click()
  await x.page.waitForFunction(()=>window.fixture.destination==='/dashboard')
  assert.equal(x.requests.length,2)
  assert.equal(await x.page.evaluate(()=>window.fixture.counts.signIns),0)
  await x.page.getByRole('button',{name:'Mon compte',exact:true}).waitFor()
 }finally{await x.context.close()}
})

test('un profil lent garde une préparation explicite et ne multiplie pas les requêtes',async()=>{
 const x=await setup();let release,requests=0
 const gate=new Promise(resolve=>{release=resolve})
 await x.context.route('**/api/profile/sync',async route=>{
  requests++;await gate
  await route.fulfill({json:{profile:{id:'A'}}})
 })
 try{
  await x.page.getByRole('button',{name:'Connexion',exact:true}).click()
  await x.page.getByRole('status').filter({hasText:'Préparation du profil'}).waitFor()
  assert.equal(await x.page.evaluate(()=>window.fixture.destination),undefined)
  await x.page.getByRole('button',{name:'Mon compte',exact:true}).waitFor()
  assert.equal(requests,1)
  release()
  await x.page.waitForFunction(()=>window.fixture.destination==='/dashboard')
  assert.equal(requests,1)
 }finally{release();await x.context.close()}
})

test('une session existante affiche le compte sans nouvelle authentification',async()=>{
 const x=await setup()
 try{
  await x.page.evaluate(()=>window.fixture.signIn())
  await x.page.getByRole('button',{name:'Mon compte',exact:true}).waitFor()
  await x.page.getByRole('heading',{name:'Tu es deja connecte',exact:true}).waitFor()
  assert.equal(await x.page.getByRole('link',{name:'Mon profil',exact:true}).getAttribute('href'),'/dashboard')
  assert.equal(x.requests.length,0)
  assert.equal(await x.page.evaluate(()=>window.fixture.counts.signIns),0)
 }finally{await x.context.close()}
})

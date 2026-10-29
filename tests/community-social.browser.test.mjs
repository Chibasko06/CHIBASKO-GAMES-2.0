import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const id=n=>'fc300000-0000-4000-8000-'+String(n).padStart(12,'0')
const profiles={a:{id:id(1),username:'joueur-alpha',avatar_url:null,created_at:'2026-10-31',roles:{admin:false,developer:false}},b:{id:id(2),username:'joueur-beta',avatar_url:null,created_at:'2026-10-31',roles:{admin:true,developer:true}}}
const entry=(p,index=3)=>({id:id(index),createdAt:'2026-10-31T12:00:00.123456+00:00',profile:p})
let browser,script,css
before(async()=>{
 const result=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import {useAuth} from '@/components/AuthProvider';import Hub from './components/CommunityHub';import Profile from './components/PublicProfileView';function App(){const {user}=useAuth();const own=new URLSearchParams(location.search).has('own');const peer=window.fixture.profiles[user?.id===window.fixture.profiles.a.id?(own?'a':'b'):(own?'b':'a')];return location.search.includes('view=community')?<><h1>Communauté</h1><Hub profiles={[]} searching={false}/></>:<Profile profile={peer}/>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'services-de-test',setup(b){
  b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  b.onResolve({filter:/^next\/(?:link|image)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{
   auth:`import {useSyncExternalStore} from 'react';export function useAuth(){const actor=useSyncExternalStore(cb=>{window.addEventListener('fixture-user',cb);return()=>window.removeEventListener('fixture-user',cb)},()=>window.fixture.actor);return {loading:false,user:actor==='guest'?null:window.fixture.profiles[actor],session:actor==='guest'?null:{access_token:'fixture-'+actor}}}`,
   link:`import {createElement} from 'react';export default function Link(props){return createElement('a',props)}`,
   image:`import {createElement} from 'react';export default function Image({unoptimized,...props}){return createElement('img',props)}`,
  }[path]}))
 }}]})
 script=result.outputFiles[0].text
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture({actor='a',view='profile',state='none',width=1366,volume=false,error=false,hold=false,own=false,holdStatus=false,listError=false,holdPage=false}={}){
 const context=await browser.newContext({viewport:{width,height:844}}),calls=[]
 const model={state,requester:'a',blocks:new Set(),release:null}
 let markStarted
 const started=new Promise(resolve=>{markStarted=resolve})
 let releaseStatus,markStatus
 const statusStarted=new Promise(resolve=>{markStatus=resolve})
 let releasePage,markPage,finishPage
 const pageStarted=new Promise(resolve=>{markPage=resolve}),pageFinished=new Promise(resolve=>{finishPage=resolve})
 function relationship(who){const other=who==='a'?'b':'a';return {state:model.blocks.has(who)||model.blocks.has(other)?'unavailable':model.state==='pending'?(model.requester===who?'outgoing':'incoming'):model.state,relationId:model.state==='none'?null:id(3)}}
 await context.addInitScript(({actor,profiles})=>{window.fixture={actor,profiles};window.fixture.switchActor=actor=>{window.fixture.actor=actor;window.dispatchEvent(new Event('fixture-user'))}},{actor,profiles})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/api/social'){
   const who=request.headers().authorization?.replace('Bearer fixture-',''),other=who==='a'?'b':'a'
   const body=request.method()==='POST'?request.postDataJSON():null
   calls.push({who,body,query:Object.fromEntries(url.searchParams)})
   if(body){
    markStarted()
    if(error)return route.fulfill({status:503,json:{error:'Transfert temporairement indisponible.'}})
    if(hold)await new Promise(resolve=>{model.release=resolve})
    if(body.action==='request'){model.state='pending';model.requester=who}
    if(body.action==='accept')model.state='friends'
    if(['reject','cancel','remove'].includes(body.action))model.state='none'
    if(body.action==='block'){model.blocks.add(who);model.state='none'}
    if(body.action==='unblock')model.blocks.delete(who)
    return route.fulfill({json:{...relationship(who),state:body.action==='block'?'blocked':relationship(who).state,replayed:false}})
   }
   if(url.searchParams.has('target')){markStatus();if(holdStatus)await new Promise(resolve=>{releaseStatus=resolve});return route.fulfill({json:relationship(who)})}
   const kind=url.searchParams.get('kind'),related=relationship(who).state
   if(listError){listError=false;return route.fulfill({status:503,json:{error:'Données indisponibles'}})}
   const items=related===kind?[entry(profiles[other])]:[]
   if(volume&&kind==='friends'){
    const start=url.searchParams.has('cursor')?Number(url.searchParams.get('cursor').slice(-12))-199:0,total=volume===true?21:volume
    if(holdPage&&start===40){markPage();await new Promise(resolve=>{releasePage=resolve})}
    await route.fulfill({json:{items:Array.from({length:Math.min(20,total-start)},(_,i)=>entry({...profiles.b,id:id(100+start+i),username:'ami-'+String(start+i).padStart(2,'0')},200+start+i)),nextCursor:start+20>=total?null:{createdAt:'2026-10-31T12:00:00.123456+00:00',id:id(200+start+19)}}})
    if(holdPage&&start===40)finishPage()
    return
   }
   return route.fulfill({json:{items,nextCursor:null}})
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-black text-white"><main class="mx-auto max-w-5xl p-4"><div id="root"></div></main><script src="/host.js"></script></body></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test/players?view='+view+(own?'&own=1':''))
 const open=async()=>{await page.getByLabel('Actions pour @'+(await page.evaluate(()=>window.fixture.actor==='a'?'joueur-beta':'joueur-alpha'))).click()}
 const switchActor=actor=>page.evaluate(actor=>window.fixture.switchActor(actor),actor)
 const settled=()=>page.waitForFunction(()=>!document.querySelector('details[open]')&&!document.querySelector('dialog[open]'))
 return {context,page,calls,model,open,switchActor,settled,started,statusStarted,releaseStatus:()=>releaseStatus?.(),pageStarted,pageFinished,releasePage:()=>releasePage?.()}
}
test('deux comptes : demande, réception et acceptation explicite sans rechargement',async()=>{
 const x=await fixture();try{
  await x.open();await x.page.getByRole('button',{name:'Ajouter en ami',exact:true}).click()
  await x.settled()
  assert.equal(x.calls.filter(c=>c.body).length,1)
  await x.switchActor('b');await x.open();await x.page.getByRole('button',{name:'Accepter la demande',exact:true}).click()
  await x.settled()
  await x.open();await x.page.getByRole('button',{name:'Supprimer des amis',exact:true}).waitFor()
  assert.deepEqual(x.calls.filter(c=>c.body).map(c=>c.body.action),['request','accept'])
 }finally{await x.context.close()}
})
for(const action of ['cancel','reject'])test('demande en attente : '+action,async()=>{
 const x=await fixture({actor:action==='cancel'?'a':'b',state:'pending'});try{
  await x.open();await x.page.getByRole('button',{name:action==='cancel'?'Annuler la demande':'Refuser la demande',exact:true}).click()
  await x.settled()
  await x.open();await x.page.getByRole('button',{name:'Ajouter en ami',exact:true}).waitFor()
  assert.equal(x.calls.filter(c=>c.body).length,1)
 }finally{await x.context.close()}
})
for(const action of ['remove','block'])for(const width of [390,1366])test('confirmation clavier avant '+action+' à '+width,async()=>{
 const x=await fixture({state:'friends',width});try{
  await x.open();await x.page.getByRole('button',{name:action==='remove'?'Supprimer des amis':'Bloquer le joueur',exact:true}).click()
  await x.page.getByRole('dialog').waitFor();assert.equal(x.calls.filter(c=>c.body).length,0)
  const box=await x.page.getByRole('dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=844)
  assert.equal(await x.page.getByRole('button',{name:'Annuler',exact:true}).evaluate(el=>el===document.activeElement),true)
  await x.page.keyboard.press('Escape');await x.page.getByRole('dialog').waitFor({state:'detached'})
  await x.page.getByRole('button',{name:action==='remove'?'Supprimer des amis':'Bloquer le joueur',exact:true}).click()
  await x.page.getByRole('button',{name:'Confirmer',exact:true}).click()
  await x.settled()
  if(action==='block')await x.page.getByText('Ce profil n’est plus accessible dans ton espace.').waitFor()
  else{await x.open();await x.page.getByRole('button',{name:'Ajouter en ami',exact:true}).waitFor()}
  assert.equal(x.calls.filter(c=>c.body).length,1)
 }finally{await x.context.close()}
})
test('réponse incertaine : relecture de la relation et aucune répétition automatique',async()=>{
 const x=await fixture({error:true});try{
  await x.open();await x.page.getByRole('button',{name:'Ajouter en ami',exact:true}).click()
  await x.page.getByRole('alert').waitFor()
  await x.page.getByText('Traitement…',{exact:true}).waitFor({state:'detached'})
  assert.equal(x.calls.filter(c=>c.body).length,1)
  assert.equal(x.calls.filter(c=>c.query.target).length,2)
 }finally{await x.context.close()}
})
test('double activation : une seule mutation en cours',async()=>{
 const x=await fixture({hold:true});try{
  await x.open();await x.page.getByRole('button',{name:'Ajouter en ami',exact:true}).evaluate(el=>{el.click();el.click()})
  await x.page.getByText('Traitement…',{exact:true}).waitFor()
  await x.started
  assert.equal(x.calls.filter(c=>c.body).length,1);x.model.release?.()
 }finally{await x.context.close()}
})
test('invité : aucune lecture privée et aucune action sociale',async()=>{
 const x=await fixture({actor:'guest',view:'community'});try{
  await x.page.getByRole('link',{name:'Se connecter',exact:true}).waitFor()
  assert.equal(x.calls.length,0);assert.equal(await x.page.locator('summary').count(),0)
 }finally{await x.context.close()}
})
test('aucune action sociale sur son propre profil',async()=>{
 const x=await fixture({own:true});try{
  await x.page.getByRole('heading',{name:'joueur-alpha',exact:true}).waitFor()
  assert.equal(await x.page.locator('summary').count(),0);assert.equal(x.calls.length,0)
 }finally{await x.context.close()}
})
test('une erreur de liste ne devient pas un état vide et la reprise reste manuelle',async()=>{
 const x=await fixture({view:'community',listError:true});try{
  await x.page.getByRole('alert').waitFor()
  assert.equal(await x.page.getByText('Pas encore d’ami',{exact:true}).count(),0)
  assert.equal(x.calls.filter(c=>c.query.kind==='friends').length,1)
  await x.page.getByRole('button',{name:'Réessayer',exact:true}).click()
  await x.page.getByText('Pas encore d’ami',{exact:true}).waitFor()
  assert.equal(x.calls.filter(c=>c.query.kind==='friends').length,2)
 }finally{await x.context.close()}
})
test('une réponse de relation tardive ne réapparaît pas après déconnexion',async()=>{
 const x=await fixture({holdStatus:true});try{
  await x.open();await x.statusStarted
  await x.switchActor('guest');x.releaseStatus()
  await x.page.getByRole('heading',{name:'joueur-alpha',exact:true}).waitFor()
  assert.equal(await x.page.locator('summary').count(),0)
  assert.equal(x.calls.filter(c=>c.body).length,0)
 }finally{await x.context.close()}
})
test('une troisième page tardive ne remplace pas les demandes après changement d’onglet',async()=>{
 const x=await fixture({view:'community',volume:41,holdPage:true});try{
  await x.page.getByRole('link',{name:'@ami-19'}).waitFor()
  await x.page.getByRole('button',{name:'Afficher 20 joueurs de plus'}).click()
  await x.page.getByRole('link',{name:'@ami-39'}).waitFor()
  await x.page.getByRole('button',{name:'Afficher 20 joueurs de plus'}).click();await x.pageStarted
  await x.page.getByRole('button',{name:'Demandes reçues',exact:true}).click()
  await x.page.getByText('Aucune demande reçue',{exact:true}).waitFor()
  x.releasePage();await x.pageFinished
  await x.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
  assert.equal(await x.page.locator('li').count(),0)
  assert.equal(await x.page.getByText('Aucune demande reçue',{exact:true}).count(),1)
 }finally{await x.context.close()}
})
for(const width of [390,768,1366,1920])test('listes paginées et navigation responsive à '+width,async()=>{
 const x=await fixture({view:'community',volume:true,width});try{
  await x.page.getByRole('link',{name:'@ami-19'}).waitFor()
  assert.equal(await x.page.locator('li').count(),20)
  await x.page.getByRole('button',{name:'Afficher 20 joueurs de plus'}).click();await x.page.getByRole('link',{name:'@ami-20'}).waitFor()
  assert.equal(await x.page.locator('li').count(),21)
  await x.page.getByRole('button',{name:'Demandes reçues',exact:true}).click();await x.page.getByText('Aucune demande reçue',{exact:true}).waitFor()
  await x.page.getByRole('button',{name:'Mes amis',exact:true}).click();await x.page.getByRole('link',{name:'@ami-20'}).waitFor()
  assert.equal(x.calls.filter(c=>c.query.kind==='friends').length,2,'Le retour à une liste conserve ses pages sans nouvelle requête')
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  if(width===390||width===1366)await x.page.screenshot({path:join(tmpdir(),'chibasko-social-'+width+'.png'),fullPage:true})
 }finally{await x.context.close()}
})

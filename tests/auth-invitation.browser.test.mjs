import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,webkit} from '@playwright/test'
import {readFileSync,mkdirSync} from 'node:fs'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const engine=process.env.AUTH_BROWSER??'chromium'
let browser,script,css
before(async()=>{
 const output=await build({entryPoints:['tests/fixtures/auth-invitation-host.tsx'],outdir:'.distribution/auth-invitation',write:false,bundle:true,jsx:'automatic',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'isolated-services',setup(b){
  b.onResolve({filter:/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  b.onResolve({filter:/profileSync$/},()=>({path:'sync',namespace:'fixture'}))
  b.onResolve({filter:/supabaseClient$/},()=>({path:'db',namespace:'fixture'}))
  b.onResolve({filter:/^next\/(link|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{
   auth:`import {useSyncExternalStore} from 'react';export function useAuth(){return useSyncExternalStore(cb=>{window.addEventListener('auth-change',cb);return()=>window.removeEventListener('auth-change',cb)},()=>window.testAuth)}`,
   sync:'export async function ensureProfile(){window.calls.profile++;return {ok:true}}',
   link:'import {createElement} from "react";export default function Link({prefetch,children,...props}){return createElement("a",props,children)}',
   navigation:'export function usePathname(){return location.pathname}',
   db:`export const supabase={rpc(){const q={order(){return q},range(){return q},abortSignal(){return q},then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve)}};return q},from(){let write=false;const q={select(){return q},eq(){return q},abortSignal(){return q},range(){return q},order(){return q},delete(){write=true;window.calls.write++;return q},upsert(){write=true;window.calls.write++;return q},insert(){write=true;window.calls.write++;return q},maybeSingle:async()=>({data:null}),then(resolve){return Promise.resolve({data:write?null:[],count:0,error:null}).then(resolve)}};return q}}`,
  }[path]}))
 }}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text
 css=output.outputFiles.find(f=>f.path.endsWith('.css')).text+'\n'+(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:'app/globals.css'})).css
 browser=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})})
 mkdirSync('.distribution/auth-invitation',{recursive:true})
})
after(async()=>browser?.close())
async function setup({width=390,height=844,kind='legacy',page=false,connected=false,native=false,loading=false}={}){
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,...(engine==='chromium'?{isMobile:true}:{})}),errors=[];context.setDefaultTimeout(5000)
 await context.addInitScript(({connected,native,loading})=>{
  window.calls={profile:0,write:0,loads:0};window.testAuth={loading,user:connected?{id:'viewer'}:null,session:connected?{access_token:'fixture',user:{id:'viewer'}}:null}
  window.changeAuth=connected=>{window.testAuth={loading:false,user:connected?{id:'viewer'}:null,session:connected?{access_token:'fixture',user:{id:'viewer'}}:null};window.dispatchEvent(new Event('auth-change'))}
  if(!native){Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:undefined});Object.defineProperty(HTMLElement.prototype,'webkitRequestFullscreen',{configurable:true,value:undefined});Object.defineProperty(HTMLElement.prototype,'webkitRequestFullScreen',{configurable:true,value:undefined})}
  window.addEventListener('message',e=>{if(e.data==='loaded')window.calls.loads++})
 },{connected,native,loading})
 await context.route('**/*',route=>{
  const u=new URL(route.request().url());assert.ok(['portal.test','play.example.com'].includes(u.hostname),'No external access')
  if(u.hostname==='play.example.com')return route.fulfill({contentType:'text/html',body:'<!doctype html><body><button>Partie</button><script>window.instance=crypto.randomUUID();window.moves=7;parent.postMessage("loaded","*")</script>'})
  if(u.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(u.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(u.pathname==='/logo-chibaskogames-rond.ico')return route.fulfill({body:''})
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:#09090b;color:white}#root{max-width:100%;padding:12px}header{height:60px}button{min-height:44px}</style><div id="root"></div><script src="/host.js"></script></html>'})
 })
 const p=await context.newPage();p.on('pageerror',e=>{errors.push(e.message);console.log('FIXTURE ERROR '+e.message)});await p.goto('https://portal.test/games/fixture?kind='+kind+(page?'&page=1':'')+'&category=arcade')
 await p.getByRole('button',{name:'Invitations répétées'}).waitFor();await p.waitForTimeout(100)
 return {context,p,errors}
}
const modal=p=>p.locator('dialog[data-auth-invitation]')
async function checkDialog(p){
 await modal(p).waitFor();assert.equal(await modal(p).count(),1)
 const r=await modal(p).boundingBox(),v=await p.evaluate(()=>({width:visualViewport.width,height:visualViewport.height,left:visualViewport.offsetLeft,top:visualViewport.offsetTop}))
 assert.ok(r.x>=v.left-1&&r.y>=v.top-1&&r.x+r.width<=v.left+v.width+1&&r.y+r.height<=v.top+v.height+1,JSON.stringify({r,v}))
 for(const [label,path]of [['Se connecter','/login'],['Créer un compte','/register']]){const url=new URL(await modal(p).getByRole('link',{name:label,exact:true}).getAttribute('href'),'https://portal.test');assert.equal(url.pathname,path);assert.equal(url.searchParams.get('next'),new URL(p.url()).pathname+new URL(p.url()).search)}
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
}
for(const kind of ['legacy','external','classic','sdk'])for(const immersive of [false,true])test(`${engine}: ${kind}, ${immersive?'immersive':'normal'}, actions preserve the game`,async()=>{
 const x=await setup({kind});const {p}=x
 try{
  await p.frameLocator('iframe').getByRole('button').waitFor();const f=p.frames().find(f=>f.url().includes('play.example.com')),identity=await f.evaluate(()=>window.instance)
  await p.locator('iframe').evaluate(e=>{window.originalFrame=e});const originalPermissions=await p.locator('iframe').evaluate(e=>[e.src,e.sandbox.value,e.allow])
  if(immersive){await p.locator('[data-player-expand]').click();await p.locator('[data-expansion=immersive]').waitFor();await p.getByRole('button',{name:'Ouvrir les commandes',exact:true}).click()}
  for(const label of ['J’aime','Je n’aime pas','Favori','J’aime']){
   const button=p.getByRole('button',{name:label,exact:true});await button.scrollIntoViewIfNeeded();const before=await p.locator('iframe').boundingBox(),count=await p.evaluate(()=>window.calls.loads)
   await button.click();await checkDialog(p);assert.deepEqual(await p.locator('iframe').boundingBox(),before)
   if(label==='J’aime')await p.screenshot({path:'.distribution/auth-invitation/'+engine+'-'+kind+'-'+(immersive?'immersive':'normal')+'.png'})
   await p.keyboard.press('Escape');await modal(p).waitFor({state:'detached'});assert.deepEqual(await p.locator('iframe').boundingBox(),before)
   assert.equal(await p.locator('iframe').evaluate(e=>e===window.originalFrame),true);assert.equal(await f.evaluate(()=>window.instance),identity);assert.equal(await f.evaluate(()=>window.moves),7);assert.equal(await p.evaluate(()=>window.calls.loads),count)
   if(immersive)assert.equal(await p.locator('[data-expansion=immersive]').count(),1)
  }
  assert.deepEqual(await p.locator('iframe').evaluate(e=>[e.src,e.sandbox.value,e.allow]),originalPermissions);assert.deepEqual(await p.evaluate(()=>window.calls.write),0)
  if(immersive){await p.screenshot({path:'.distribution/auth-invitation/'+engine+'-'+kind+'-closed.png'});await p.locator('[data-player-expand]').click()}
  assert.deepEqual(x.errors,[])
 }finally{await x.context.close()}
})
for(const width of [320,390,1366])test(`${engine}: page actions, focus, long text and repeated invitations at ${width}`,async()=>{
 const x=await setup({width,page:true});const {p}=x
 try{
  for(const name of ['J’aime','Ajouter aux favoris','Publier mon avis']){
   await p.getByRole('button',{name,exact:true}).click();await checkDialog(p);await p.getByRole('button',{name:'Fermer l’invitation'}).click();await modal(p).waitFor({state:'detached'})
   assert.equal(await p.getByRole('button',{name,exact:true}).evaluate(e=>e===document.activeElement),true)
  }
  await p.getByLabel('Actions pour @joueur').click();await p.getByRole('button',{name:'Gérer la relation',exact:true}).click();await checkDialog(p);await p.keyboard.press('Escape')
  await p.getByLabel('Partager ce jeu').click();await p.getByRole('button',{name:'Partager à un ami',exact:true}).click();await checkDialog(p);await p.keyboard.press('Escape')
  await p.getByLabel('Partager ce jeu').click();assert.match(await p.getByRole('link',{name:'Signaler le jeu',exact:true}).getAttribute('href'),/^\/contact\?/)
  await p.getByRole('button',{name:'Invitations répétées'}).click();await checkDialog(p);assert.equal(await modal(p).getByText('Première invitation').count(),1)
  for(let i=0;i<8;i++){await p.keyboard.press('Tab');assert.equal(await modal(p).evaluate(e=>e.contains(document.activeElement)),true)}
  await p.keyboard.press('Escape');await p.getByRole('button',{name:'Texte long'}).click();await checkDialog(p);assert.equal(await modal(p).evaluate(e=>e.scrollHeight>e.clientHeight),true)
  await p.screenshot({path:'.distribution/auth-invitation/'+engine+'-page-'+width+'.png'});await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>window.calls.write),0);assert.deepEqual(x.errors,[])
 }finally{await x.context.close()}
})
test(`${engine}: authentication, teardown and viewport changes clean up the invitation`,async()=>{
 const x=await setup({height:390,width:844});const {p}=x
 try{
  await p.locator('[data-player-expand]').click();await p.getByRole('button',{name:'Ouvrir les commandes',exact:true}).click();await p.getByRole('button',{name:'J’aime',exact:true}).click();await checkDialog(p)
  await p.setViewportSize({width:390,height:844});await checkDialog(p);await p.setViewportSize({width:844,height:240});await checkDialog(p)
  await p.evaluate(()=>window.changeAuth(true));await modal(p).waitFor({state:'detached'});assert.equal(await p.evaluate(()=>window.calls.write),0)
  await p.getByRole('button',{name:'J’aime',exact:true}).click();await p.waitForFunction(()=>window.calls.write===1);assert.equal(await modal(p).count(),0)
  await p.evaluate(()=>window.changeAuth(false));await p.getByRole('button',{name:'J’aime',exact:true}).click();await checkDialog(p);await p.evaluate(()=>document.querySelector('#remove').click());await modal(p).waitFor({state:'detached'});assert.notEqual(await p.evaluate(()=>document.body.style.position),'fixed');assert.deepEqual(x.errors,[])
 }finally{await x.context.close()}
})
test(`${engine}: native fullscreen keeps the invitation in the fullscreen subtree`,async()=>{
 const x=await setup({native:true,width:1024,height:768});try{
  await x.p.locator('[data-player-expand]').click();await x.p.getByRole('button',{name:'Ouvrir les commandes',exact:true}).click();await x.p.getByRole('button',{name:'J’aime',exact:true}).click();await checkDialog(x.p)
  assert.equal(await modal(x.p).evaluate(e=>e.closest('[data-expansion]')!==null),true);await x.p.getByRole('button',{name:'Fermer l’invitation'}).click();assert.equal(await x.p.locator('iframe').count(),1);assert.deepEqual(x.errors,[])
 }finally{await x.context.close()}
})
test(`${engine}: safe return, backdrop, reverse focus and background scroll`,async()=>{
 const x=await setup({page:true});const {p}=x
 try{
  await p.goto('https://portal.test/games/fixture?page=1&session=fixture-only');await p.evaluate(()=>{document.body.style.overflowX='clip'})
  const trigger=p.getByRole('button',{name:'Invitations répétées'});await trigger.click();await modal(p).waitFor()
  for(const link of await modal(p).getByRole('link').all())assert.equal(new URL(await link.getAttribute('href'),'https://portal.test').searchParams.get('next'),'/')
  await p.keyboard.press('Shift+Tab');assert.equal(await modal(p).getByRole('link',{name:'Créer un compte'}).evaluate(e=>e===document.activeElement),true)
  const scroll=await p.evaluate(()=>scrollY);await p.mouse.wheel(0,600);await p.waitForTimeout(60);assert.equal(await p.evaluate(()=>scrollY),scroll)
  await p.mouse.click(1,1);await modal(p).waitFor({state:'detached'});assert.equal(await trigger.evaluate(e=>e===document.activeElement),true)
  assert.equal(await p.evaluate(()=>document.body.style.position),'');assert.equal(await p.evaluate(()=>document.body.style.overflowX),'clip');assert.equal(await p.evaluate(()=>window.calls.write),0);assert.deepEqual(x.errors,[])
 }finally{await x.context.close()}
})
test(`${engine}: authentication still loading never asks an existing account to sign in`,async()=>{
 const x=await setup({page:true,loading:true});try{
  assert.equal(await x.p.getByRole('button',{name:'J’aime',exact:true}).isDisabled(),true)
  assert.equal(await x.p.getByRole('button',{name:'Publier mon avis',exact:true}).isDisabled(),true)
  await x.p.getByLabel('Partager ce jeu').click();assert.equal(await x.p.getByRole('button',{name:'Partager à un ami',exact:true}).isDisabled(),true)
  assert.equal(await modal(x.p).count(),0);assert.equal(await x.p.evaluate(()=>window.calls.write),0)
  await x.p.evaluate(()=>window.changeAuth(false));await x.p.getByRole('button',{name:'J’aime',exact:true}).click();await checkDialog(x.p);assert.deepEqual(x.errors,[])
 }finally{await x.context.close()}
})

import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {gameLaunchRequest} from '../lib/server/gameLaunches.ts'
import {assertPlayerLayout} from './helpers/player-layout.mjs'
let browser,js,css
before(async()=>{
 const bundle=await build({entryPoints:['tests/fixtures/game-player-host.tsx'],bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,outdir:'.distribution/game-player-browser',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-platform-services',setup(build){
  build.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  build.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'fixture'}))
  build.onResolve({filter:/^@\/lib\/profileSync$/},()=>({path:'profile',namespace:'fixture'}))
  build.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}))
  build.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}))
  build.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),loader:'js',contents:{
   auth:`const anonymous={user:null,session:null,loading:false},signed={user:{id:'owner'},session:{user:{id:'owner'},access_token:'fixture-only'},loading:false};export function useAuth(){return window.fixtureSignedIn?signed:anonymous}`,
   supabase:`export const supabase={from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:null,error:null}}}},async rpc(){return {data:[],error:null}}}`,
   profile:`export async function ensureProfile(){return {ok:true}}`,
   navigation:`export function useRouter(){return {push(){throw Error('Unexpected navigation in embedded player')}}}`,
   link:`import {createElement} from 'react';export default function Link(props){return createElement('a',props)}`,
  }[path]}))
 }}]})
 js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).contents;css=bundle.outputFiles.find(file=>file.path.endsWith('.css')).contents
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function setup({kind='artifact',availableAccess=[],viewport={width:1366,height:768},signed=false,launchFailures=0,nativeViewport,fixedViewport,developerName='Fixture Studio',headingHeight=36,touch=false,pagePadding=0}={}){
 const h=await runtimeHarness('pong-like'),context=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,deviceScaleFactor:touch?2:1}),calls=[]
 let snapshot={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gameId:h.request.gameId,gameVersionId:h.request.gameVersionId,access:'public',status:'waiting',code:'',minPlayers:1,maxPlayers:8,revision:1,startPolicy:'manual',expiresAt:new Date(Date.now()+3600000).toISOString(),onlineSessionReference:null,members:[{id:'opaque-fixture',displayName:'Player',self:true,leader:true,ready:false}]}
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());calls.push({path:url.pathname,method:req.method(),host:url.hostname})
  if(url.hostname==='portal.test'){
   if(url.pathname==='/games/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/host.css"></head><body style="margin:0;background:#09090b;color:white"><h1 style="font:600 18px system-ui;margin:0;height:'+headingHeight+'px">Fixture · Chibasko Games</h1><div id="player" style="min-width:0;margin-inline:'+pagePadding+'px"></div><script src="/host.js"></script></body></html>'})
   if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(js)})
   if(url.pathname==='/host.css')return route.fulfill({contentType:'text/css',body:Buffer.from(css)})
   if(url.pathname==='/cover.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400"><rect width="640" height="400" fill="#164e63"/><circle cx="320" cy="200" r="90" fill="#22d3ee"/></svg>'})
   if(url.pathname==='/logo-chibaskogames-rond.ico')return route.fulfill({contentType:'image/x-icon',body:readFileSync('public/logo-chibaskogames-rond.ico')})
   if(url.pathname.startsWith('/api/multiplayer/')){
    assert.ok(availableAccess.length,'unavailable online modes must never request lobbies')
    const body=req.postData()?req.postDataJSON():{}
    if(url.pathname.endsWith('/ready'))snapshot={...snapshot,members:[{...snapshot.members[0],ready:body.ready}],revision:snapshot.revision+1}
    if(url.pathname.endsWith('/start'))snapshot={...snapshot,status:'starting',onlineSessionReference:'fixture-session-reference',revision:snapshot.revision+1}
    const data=url.pathname.endsWith('/lobbies') && req.method()==='GET'?{items:[],nextCursor:null}:snapshot
    return route.fulfill({json:{data}})
   }
   if(url.pathname.startsWith('/api/game-launches')){
    if(req.method()==='POST' && url.pathname==='/api/game-launches' && launchFailures-->0)return route.fulfill({status:503,json:{error:{code:'service_unavailable'}}})
    const request=new Request(req.url(),{method:req.method(),headers:await req.allHeaders(),...(req.postData()?{body:req.postData()}: {})})
    const response=await gameLaunchRequest(request,url.pathname.split('/')[3],{actor:async()=>signed?'owner':null,service:()=>h.service})
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   }
  }
  if(url.hostname==='legacy.test')return route.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#102332;color:white;font:24px system-ui;display:grid;place-items:center;height:100vh">Legacy HTML5 fixture</body>'})
  if(url.hostname.startsWith('l-')){
   const response=await h.gateway(new Request(req.url(),{headers:await req.allHeaders()}))
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
  }
  return route.fulfill({status:404,body:''})
 })
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('https://portal.test/games/fixture');await page.waitForFunction(()=>!!window.gamePlayerFixture,null,{timeout:3000}).catch(()=>{throw Error('Fixture bootstrap: '+JSON.stringify(errors))})
 await page.evaluate(signed=>window.fixtureSignedIn=signed,signed)
 await page.evaluate(options=>window.gamePlayerFixture.render(options),{kind,nativeViewport,fixedViewport,developerName,gameId:h.request.gameId,versionId:h.request.gameVersionId,slug:'fixture',title:'Fixture Arena',coverUrl:'https://portal.test/cover.svg',capabilities:h.row.manifest.capabilities,availableAccess,initialLikes:0,initialDislikes:0,gameUrl:'https://legacy.test/index.html'})
 await page.waitForTimeout(100);assert.deepEqual(errors,[])
 return {page,context,h,calls}
}
async function oneDock(page){assert.equal(await page.getByRole('region',{name:'Jeu Chibasko Games',exact:true}).count(),1);assert.equal(await page.locator('[data-player-dock]').count(),1)}

const launcher=page=>page.getByLabel('Écran de lancement',{exact:true})
const startLocal=page=>page.getByRole('button',{name:/^Jouer en local/}).click()
async function assertIdle(x){
 await launcher(x.page).waitFor();await oneDock(x.page)
 assert.equal(await x.page.locator('iframe').count(),0)
 assert.equal(x.h.sessions.size,0)
 assert.ok(!x.calls.some(call=>call.path.startsWith('/api/')))
}
test('legacy launcher has exactly one Play action and returns to the identical launcher after quit',async()=>{
 const x=await setup({kind:'legacy'})
 try{
  await assertIdle(x);const initial=await launcher(x.page).innerHTML()
  assert.equal(await launcher(x.page).getByRole('button').count(),1)
  await x.page.getByRole('button',{name:'Jouer',exact:true}).click()
  await x.page.frameLocator('iframe').getByText('Legacy HTML5 fixture').waitFor();await oneDock(x.page)
  assert.equal(await x.page.locator('iframe').getAttribute('allow'),'fullscreen; autoplay; clipboard-write; gamepad')
  assert.equal(await x.page.locator('iframe').getAttribute('allowfullscreen'),'')
  assert.ok(!x.calls.some(call=>call.path.startsWith('/api/game-launches')))
  await assertPlayerLayout(x.page)
  await x.page.getByRole('button',{name:'Quitter le jeu',exact:true}).click()
  await launcher(x.page).waitFor();assert.equal(await x.page.locator('iframe').count(),0)
  assert.equal(await launcher(x.page).innerHTML(),initial)
  assert.equal(await x.page.getByText('Jeu fermé',{exact:true}).count(),0)
  await x.page.getByRole('button',{name:'Jouer',exact:true}).click();await x.page.locator('iframe').waitFor()
 }finally{await x.context.close()}
})
test('artifact requires explicit local click and keeps three declared modes on the same launcher',async()=>{
 const x=await setup()
 try{
  await assertIdle(x);const initial=await launcher(x.page).innerHTML()
  assert.equal(await launcher(x.page).getByRole('button').count(),3)
  for(const name of [/^Jouer en ligne/,/^Partie privée/]){
   const button=x.page.getByRole('button',{name});assert.equal(await button.isDisabled(),true)
   await button.evaluate(node=>node.click())
  }
  assert.ok(!x.calls.some(call=>call.path.startsWith('/api/')))
  await startLocal(x.page);await x.page.locator('[data-phase="running"]').waitFor();await oneDock(x.page)
  await x.page.getByRole('button',{name:'Quitter le jeu',exact:true}).click()
  await launcher(x.page).waitFor();assert.equal(await launcher(x.page).innerHTML(),initial)
  assert.equal(await x.page.locator('iframe').count(),0)
  assert.ok(x.h.released.length===1)
  assert.ok(!x.calls.some(call=>call.path.startsWith('/api/multiplayer/')))
 }finally{await x.context.close()}
})
test('multiple available modes launch inside the same fullscreen player and return to the initial launcher',async()=>{
 const x=await setup({availableAccess:['public','private']})
 try{
  await assertIdle(x);const initial=await launcher(x.page).innerHTML()
  assert.equal(await launcher(x.page).getByRole('button',{disabled:false}).count(),3)
  if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:'.distribution/game-launcher.png'})
  await x.page.getByRole('button',{name:'Plein écran',exact:true}).click();await x.page.waitForFunction(()=>!!document.fullscreenElement)
  await startLocal(x.page);await x.page.locator('[data-phase="running"]').waitFor()
  await oneDock(x.page);await assertPlayerLayout(x.page,true)
  assert.equal(x.page.url(),'https://portal.test/games/fixture')
  await x.page.evaluate(()=>document.exitFullscreen())
  await x.page.getByRole('button',{name:'Quitter le jeu',exact:true}).click();await launcher(x.page).waitFor()
  assert.equal(await launcher(x.page).innerHTML(),initial)
 }finally{await x.context.close()}
})
test('online lobby stays integrated and leaves through the dock before restoring the launcher',async()=>{
 const x=await setup({availableAccess:['public'],signed:true})
 try{
  await assertIdle(x);const initial=await launcher(x.page).innerHTML()
  await x.page.getByRole('button',{name:/^Jouer en ligne/}).click()
  await x.page.getByRole('button',{name:'Créer un salon public',exact:true}).click()
  await x.page.getByRole('button',{name:'Je suis prêt',exact:true}).click()
  await x.page.getByRole('button',{name:'Lancer la partie',exact:true}).click()
  await x.page.locator('[data-phase="running"]').waitFor();await oneDock(x.page);await assertPlayerLayout(x.page)
  await x.page.getByRole('button',{name:'Quitter le jeu',exact:true}).click();await launcher(x.page).waitFor()
  assert.equal(await launcher(x.page).innerHTML(),initial)
  assert.ok(x.calls.some(call=>call.path.endsWith('/leave')))
 }finally{await x.context.close()}
})
test('failed launch offers retry and a return to the same launcher, with no closed screen',async()=>{
 const x=await setup({launchFailures:2})
 try{
  await assertIdle(x);const initial=await launcher(x.page).innerHTML()
  await startLocal(x.page);await x.page.locator('[data-phase="failed"]').waitFor()
  await x.page.getByRole('button',{name:'Retour au launcher',exact:true}).click();await launcher(x.page).waitFor()
  assert.equal(await launcher(x.page).innerHTML(),initial)
  await startLocal(x.page);await x.page.locator('[data-phase="failed"]').waitFor()
  await x.page.getByRole('button',{name:'Réessayer',exact:true}).click();await x.page.locator('[data-phase="running"]').waitFor()
  assert.equal(x.h.sessions.size,1)
  assert.equal(await x.page.getByText('Jeu fermé',{exact:true}).count(),0)
 }finally{await x.context.close()}
})
for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1024,height:768}])for(const kind of ['legacy','artifact'])test(kind+' launcher and non-overlapping dock '+viewport.width+'x'+viewport.height,async()=>{
 const x=await setup({kind,viewport})
 try{
  await assertIdle(x);await assertPlayerLayout(x.page)
  const initialSurface=await x.page.locator('[data-player-surface]').boundingBox()
  const shell=await x.page.getByRole('region',{name:'Jeu Chibasko Games',exact:true}).boundingBox()
  assert.ok(shell.y+shell.height<=viewport.height-15)
  await launcher(x.page).getByText('Par Fixture Studio',{exact:true}).waitFor()
  const overflowing=await launcher(x.page).evaluate(node=>node.scrollHeight>node.clientHeight+1)
  assert.equal(overflowing,false,'launcher contents must fit without internal scrolling')
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:'.distribution/'+kind+'-launcher-'+viewport.width+'x'+viewport.height+'.png'})
  if(kind==='artifact'){await startLocal(x.page);await x.page.locator('[data-phase="running"]').waitFor()}
  else{await x.page.getByRole('button',{name:'Jouer',exact:true}).click();await x.page.frameLocator('iframe').getByText('Legacy HTML5 fixture').waitFor()}
  await oneDock(x.page);await assertPlayerLayout(x.page)
  assert.deepEqual(await x.page.locator('[data-player-surface]').boundingBox(),initialSurface)
  await x.page.getByRole('button',{name:'Plein écran',exact:true}).click();await x.page.waitForFunction(()=>!!document.fullscreenElement)
  await assertPlayerLayout(x.page,true)
  if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:'.distribution/'+kind+'-fullscreen-'+viewport.width+'x'+viewport.height+'.png'})
  await x.page.evaluate(()=>document.exitFullscreen());await x.page.waitForFunction(()=>!document.fullscreenElement)
  await x.page.getByRole('button',{name:'Quitter le jeu',exact:true}).click();await launcher(x.page).waitFor()
  await assertPlayerLayout(x.page)
  assert.deepEqual(await x.page.locator('[data-player-surface]').boundingBox(),initialSurface)
 }finally{await x.context.close()}
})

for(const nativeViewport of [{width:960,height:720},{width:1920,height:800}])test('legacy contains native '+nativeViewport.width+'x'+nativeViewport.height,async()=>{
 const x=await setup({kind:'legacy',nativeViewport})
 try{
 await x.page.getByRole('button',{name:'Jouer',exact:true}).click();await x.page.locator('iframe').waitFor()
 for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:844,height:390}]){
 await x.page.setViewportSize(viewport);await x.page.waitForTimeout(100);await assertPlayerLayout(x.page)
 const box=await x.page.locator('iframe').boundingBox();assert.ok(Math.abs(box.width/box.height-nativeViewport.width/nativeViewport.height)<0.01)
 const dimensions=await x.page.frames()[1].evaluate(()=>({width:innerWidth,height:innerHeight}));assert.deepEqual(dimensions,nativeViewport)
 }
 }finally{await x.context.close()}
})
test('SDK receives real viewport dimensions and native resize events',async()=>{
 const x=await setup()
 try{
 await startLocal(x.page);await x.page.locator('[data-phase="running"]').waitFor()
 const frame=x.page.frames()[1];await frame.evaluate(()=>{
 window.resizeCount=0;document.body.style.margin='0';const canvas=document.createElement('canvas');document.body.replaceChildren(canvas)
 const resize=()=>{window.resizeCount++;canvas.width=innerWidth;canvas.height=innerHeight;canvas.style.cssText='display:block;width:100vw;height:100vh'}
 addEventListener('resize',resize);resize()
 })
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1920,height:1080}]){
 await x.page.setViewportSize(viewport);await x.page.waitForTimeout(100)
 const box=await x.page.locator('[data-player-surface]').boundingBox();const size=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(Math.abs(size.width-box.width)<=1 && Math.abs(size.height-box.height)<=1)
 const canvas=await frame.locator('canvas').boundingBox();assert.ok(Math.abs(canvas.width-box.width)<=1 && Math.abs(canvas.height-box.height)<=1)
 }
 assert.ok(await frame.evaluate(()=>window.resizeCount)>0)
 await x.page.getByRole('button',{name:'Plein écran',exact:true}).click();await x.page.waitForTimeout(100);await assertPlayerLayout(x.page,true)
 await x.page.evaluate(()=>document.exitFullscreen());await x.page.waitForTimeout(100);await assertPlayerLayout(x.page)
 }finally{await x.context.close()}
})

test('fixed SDK compatibility viewport is uniformly contained through resize and fullscreen',async()=>{
 const fixedViewport={width:1000,height:750},x=await setup({fixedViewport})
 try{
 await startLocal(x.page);await x.page.locator('[data-phase="running"]').waitFor()
 await x.page.frames()[1].evaluate(()=>{document.body.style.margin='0';const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=750;canvas.style.cssText='display:block;width:1000px;height:750px';document.body.replaceChildren(canvas)})
 for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:844,height:390}]){
 await x.page.setViewportSize(viewport);await x.page.waitForTimeout(100);await assertPlayerLayout(x.page)
 const box=await x.page.locator('iframe').boundingBox();assert.ok(Math.abs(box.width/box.height-4/3)<0.01)
 const canvas=await x.page.frames()[1].locator('canvas').evaluate(element=>({width:element.getBoundingClientRect().width,height:element.getBoundingClientRect().height}));assert.deepEqual(canvas,fixedViewport)
 assert.deepEqual(await x.page.frames()[1].evaluate(()=>({width:innerWidth,height:innerHeight})),fixedViewport)
 }
 await x.page.getByRole('button',{name:'Plein écran',exact:true}).click();await x.page.waitForTimeout(100);await assertPlayerLayout(x.page,true)
 await x.page.evaluate(()=>document.exitFullscreen());await x.page.waitForTimeout(100);await assertPlayerLayout(x.page)
 }finally{await x.context.close()}
})

for(const viewport of [{width:1366,height:768},{width:1920,height:1080}])test('common bounded geometry with page heading '+viewport.width+'x'+viewport.height,async()=>{
 const boxes=[]
 for(const kind of ['legacy','artifact']){
 const x=await setup({kind,viewport,headingHeight:200})
 try{
 const shell=await x.page.getByRole('region',{name:'Jeu Chibasko Games',exact:true}).boundingBox(),surface=await x.page.locator('[data-player-surface]').boundingBox()
 assert.ok(shell.y+shell.height<=viewport.height-15);assert.ok(surface.height<=720)
 boxes.push({width:surface.width,height:surface.height,shellHeight:shell.height})
 console.log(kind+' '+viewport.width+'x'+viewport.height+' '+JSON.stringify(boxes.at(-1)))
 }finally{await x.context.close()}
 }
 assert.deepEqual(boxes[0],boxes[1])
})
for(const kind of ['legacy','artifact'])test(kind+' hides unknown developer attribution',async()=>{
 const x=await setup({kind,developerName:'  '})
 try{assert.equal(await launcher(x.page).getByText(/^Par /).count(),0)}finally{await x.context.close()}
})

async function inspectMobilePlayer(page){
 return page.evaluate(()=>{
  const shell=document.querySelector('[aria-label="Jeu Chibasko Games"]'),surface=document.querySelector('[data-player-surface]'),dock=document.querySelector('[data-player-dock]'),launcher=document.querySelector('[aria-label="Écran de lancement"]')
  const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}
  const containers=[document.documentElement,document.body,document.getElementById('player'),shell,surface,launcher]
  return {shell:rect(shell),surface:rect(surface),dock:rect(dock),scroll:containers.map(node=>({tag:node.tagName,clientHeight:node.clientHeight,scrollHeight:node.scrollHeight,overflow:getComputedStyle(node).overflow,minHeight:getComputedStyle(node).minHeight})),actions:[...launcher.querySelectorAll('button,h2,p')].filter(node=>node.getClientRects().length).map(node=>({text:node.textContent,...rect(node)}))}
 })
}
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1024,height:768}])for(const kind of ['legacy','artifact'])for(const headingHeight of [36,200])test('mobile no internal scroll '+kind+' '+viewport.width+'x'+viewport.height+' heading '+headingHeight,async()=>{
 const x=await setup({kind,viewport,headingHeight,touch:true,pagePadding:16})
 try{
 await assertIdle(x)
 const measured=await inspectMobilePlayer(x.page)
 console.log('MOBILE '+kind+' '+viewport.width+'x'+viewport.height+' heading='+headingHeight+' '+JSON.stringify(measured))
 assert.ok(measured.dock.y+measured.dock.height<=viewport.height,'dock visible without page scrolling')
 assert.equal(await launcher(x.page).evaluate(node=>{node.scrollTop=500;return node.scrollTop}),0,'launcher cannot scroll programmatically')
 if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:'.distribution/mobile-check-'+kind+'-'+viewport.width+'x'+viewport.height+'-'+headingHeight+'.png'})
 for(const container of measured.scroll.slice(3))assert.ok(container.scrollHeight<=container.clientHeight+1,JSON.stringify(container))
 const bounds=measured.surface
 for(const action of measured.actions){assert.ok(action.x>=bounds.x && action.y>=bounds.y-1,action.text);assert.ok(action.x+action.width<=bounds.x+bounds.width+1 && action.y+action.height<=bounds.y+bounds.height+1,action.text);assert.ok(action.y+action.height<=viewport.height,action.text)}
 await x.page.getByRole('button',{name:kind==='legacy'?'Jouer':/^Jouer en local/,exact:kind==='legacy'}).click()
 if(kind==='artifact'){
 await x.page.locator('[data-phase="running"]').waitFor()
 const frame=x.page.frames()[1],before=await x.page.locator('[data-player-surface]').boundingBox()
 assert.deepEqual(before,measured.surface)
 const size=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(Math.abs(size.width-before.width)<=1 && Math.abs(size.height-before.height)<=1)
 console.log('SDK_VIEWPORT '+viewport.width+'x'+viewport.height+' heading='+headingHeight+' '+JSON.stringify(size))
 const pageHeight=await x.page.evaluate(()=>document.documentElement.scrollHeight)
 await frame.evaluate(()=>{const giant=document.createElement('div');giant.style.cssText='width:20000px;height:20000px';document.body.append(giant)})
 assert.equal(await x.page.evaluate(()=>document.documentElement.scrollHeight),pageHeight)
 assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 assert.deepEqual(await x.page.locator('[data-player-surface]').boundingBox(),before)
 }
 }finally{await x.context.close()}
})

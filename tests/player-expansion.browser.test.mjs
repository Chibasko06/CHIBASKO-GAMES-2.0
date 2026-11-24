import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,webkit} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'

const engine=process.env.EXPANSION_BROWSER??'chromium'
assert.ok(['chromium','webkit'].includes(engine))
const browser=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})})
const bundle=await build({entryPoints:['tests/fixtures/player-expansion-host.tsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',outdir:'.distribution/player-expansion',define:{'process.env.NODE_ENV':'"production"'}})
const script=bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).contents
const output=join(process.cwd(),'.distribution/player-expansion');await mkdir(output,{recursive:true})
const errors=[]
async function setup({api='absent',kind='sdk',viewport={width:390,height:844}}={}){
 const context=await browser.newContext({viewport,hasTouch:true,...(engine==='chromium'?{isMobile:true}:{})});context.setDefaultTimeout(8000)
 await context.addInitScript(api=>{
  if(location.hostname!=='portal.test')return
  window.testCalls={enter:0,exit:0,loads:0};window.readyMessageCount=0
  window.addEventListener('message',e=>{if(e.data==='fixture-ready')window.readyMessageCount++})
  if(api==='actual')return
  let current=null
  Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:api!=='disabled'})
  if(api==='prefixed'||api==='prefixed-old'){
   Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:undefined});Object.defineProperty(document,'webkitFullscreenEnabled',{configurable:true,value:true});Object.defineProperty(document,'webkitFullscreenElement',{configurable:true,get:()=>current})
   Object.defineProperty(document,'exitFullscreen',{configurable:true,value:undefined})
   Object.defineProperty(HTMLElement.prototype,api==='prefixed'?'webkitRequestFullScreen':'webkitRequestFullscreen',{configurable:true,value:undefined})
   Object.defineProperty(document,api==='prefixed'?'webkitCancelFullScreen':'webkitExitFullscreen',{configurable:true,value:undefined})
   const setCurrent=element=>{current=element}
   const enter=function(){window.testCalls.enter++;setCurrent(this);document.dispatchEvent(new Event('webkitfullscreenchange'))},exit=function(){window.testCalls.exit++;current=null;document.dispatchEvent(new Event('webkitfullscreenchange'))}
   Object.defineProperty(HTMLElement.prototype,api==='prefixed'?'webkitRequestFullscreen':'webkitRequestFullScreen',{configurable:true,value:enter});Object.defineProperty(document,api==='prefixed'?'webkitExitFullscreen':'webkitCancelFullScreen',{configurable:true,value:exit});return
  }
  if(api==='absent'){Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:undefined});Object.defineProperty(HTMLElement.prototype,'webkitRequestFullscreen',{configurable:true,value:undefined});Object.defineProperty(HTMLElement.prototype,'webkitRequestFullScreen',{configurable:true,value:undefined});return}
  Object.defineProperty(Element.prototype,'requestFullscreen',{configurable:true,value:function(){window.testCalls.enter++;if(api==='throws')throw new TypeError('fixture');if(api==='rejected')return Promise.reject(new DOMException('Fixture denial','NotAllowedError'));if(api==='pending')return new Promise(resolve=>{window.finishNative=()=>{Object.defineProperty(document,'fullscreenElement',{configurable:true,value:this});document.dispatchEvent(new Event('fullscreenchange'));resolve()}});return Promise.resolve()}})
  Object.defineProperty(document,'exitFullscreen',{configurable:true,value:async()=>{window.testCalls.exit++;Object.defineProperty(document,'fullscreenElement',{configurable:true,value:null});document.dispatchEvent(new Event('fullscreenchange'))}})
 },api)
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());assert.ok(['portal.test','play.example.com'].includes(u.hostname),'No external access')
  if(u.hostname==='play.example.com')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#164e63;color:white"><button id="play" style="width:160px;height:80px">Jouer</button><script>window.instance=crypto.randomUUID();window.moves=0;document.querySelector('button').onclick=()=>{window.moves++;document.querySelector('button').textContent='Actions '+window.moves};parent.postMessage('fixture-ready','*')</script>`})
  if(u.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(script)})
  if(u.pathname==='/host.css')return route.fulfill({contentType:'text/css',body:Buffer.from(css)})
  if(u.pathname==='/logo-chibaskogames-rond.ico')return route.fulfill({contentType:'image/x-icon',body:await readFile('public/logo-chibaskogames-rond.ico')})
  return route.fulfill({contentType:'text/html',body:`<!doctype html><html style="scroll-behavior:smooth"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/host.css"><style>body{margin:0;color:white;background:#09090b}header{position:sticky;top:0;z-index:20;background:red;height:90px}main{position:relative;z-index:0;transform:translateZ(0);contain:paint;overflow:hidden}.before{height:500px}.after{height:900px}button{min-width:44px;min-height:44px}</style><body style="overflow-x:clip"><header id="portal-nav" aria-hidden="false"><button>Compte</button></header><main id="main" style="isolation:isolate"><div class="before" id="before">Avant le jeu</div><div id="player"></div><div class="after" id="after" style="opacity:.8">Après le jeu</div></main><footer id="footer" inert>Footer</footer><script src="/host.js"></script>`})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://portal.test/game?kind='+kind);await page.frameLocator('iframe').locator('#play').waitFor()
 await page.locator('[data-player-expand]').scrollIntoViewIfNeeded();await page.waitForTimeout(50)
 await page.evaluate(()=>{window.baselineIframe=document.querySelector('iframe');window.originalBody=document.body.style.cssText;window.originalMain=document.querySelector('#main').style.cssText;window.originalAfter=document.querySelector('#after').style.cssText;window.originalY=scrollY})
 const frame=page.frames().find(f=>f.url().startsWith('https://play.example.com/')),identity=await frame.evaluate(()=>window.instance)
 return {context,page,frame,identity}
}
async function unchanged(x){assert.equal(await x.page.evaluate(()=>window.baselineIframe===document.querySelector('iframe')),true);assert.equal(await x.frame.evaluate(()=>window.instance),x.identity);assert.equal(await x.page.evaluate(()=>window.readyMessageCount),1)}
async function restored(x){await x.page.waitForFunction(()=>document.querySelector('[data-expansion]')?.dataset.expansion==='inline');assert.deepEqual(await x.page.evaluate(()=>({body:document.body.style.cssText,main:document.querySelector('#main').style.cssText,after:document.querySelector('#after').style.cssText,inert:document.querySelector('#portal-nav').inert,aria:document.querySelector('#portal-nav').getAttribute('aria-hidden'),footerInert:document.querySelector('#footer').inert,role:document.querySelector('[data-expansion]').getAttribute('role')})),await x.page.evaluate(()=>({body:window.originalBody,main:window.originalMain,after:window.originalAfter,inert:false,aria:'false',footerInert:true,role:null})));await unchanged(x)}
try{
 for(const kind of ['classic','sdk','external','legacy'])await test(`${engine}: ${kind}, repeated immersive entries preserve iframe and state`,async()=>{
  const x=await setup({kind});try{
   const permissions=await x.page.locator('iframe').evaluate(f=>({allow:f.getAttribute('allow'),sandbox:f.getAttribute('sandbox'),src:f.getAttribute('src')}))
   for(let i=0;i<3;i++){
    await x.page.getByRole('button',{name:'Agrandir le jeu',exact:true}).click();await x.page.locator('[data-expansion=immersive]').waitFor();assert.equal(await x.page.locator('#portal-nav').evaluate(e=>e.inert),true)
    const box=await x.page.locator('[data-expansion]').boundingBox(),visual=await x.page.evaluate(()=>({width:visualViewport.width,height:visualViewport.height}));assert.ok(Math.abs(box.width-visual.width)<1&&Math.abs(box.height-visual.height)<1)
    await x.page.frameLocator('iframe').locator('#play').tap();assert.equal(await x.frame.evaluate(()=>window.moves),i+1)
    await x.page.getByRole('button',{name:'Couper le son',exact:true}).click();await x.page.getByRole('button',{name:'Réactiver le son',exact:true}).click()
    await x.page.getByRole('button',{name:'Réduire le jeu',exact:true}).click();await restored(x)
   }
   assert.deepEqual(await x.page.locator('iframe').evaluate(f=>({allow:f.getAttribute('allow'),sandbox:f.getAttribute('sandbox'),src:f.getAttribute('src')})),permissions)
   assert.ok(Math.abs(await x.page.evaluate(()=>scrollY-window.originalY))<2)
  }finally{await x.context.close()}
 })
 for(const api of ['rejected','throws','disabled','resolved-without-entry','pending'])await test(`${engine}: native ${api} falls back safely`,async()=>{
  const x=await setup({api});try{await x.page.getByRole('button',{name:'Agrandir le jeu',exact:true}).click();await x.page.locator('[data-expansion=immersive]').waitFor();if(api==='disabled')assert.equal(await x.page.evaluate(()=>window.testCalls.enter),0);await unchanged(x);await x.page.getByRole('button',{name:'Réduire le jeu',exact:true}).click();await restored(x)}finally{await x.context.close()}
 })
 for(const api of ['prefixed','prefixed-old'])await test(`${engine}: ${api} API and event are supported (simulation)`,async()=>{
  const x=await setup({api,viewport:{width:1024,height:768}});try{await x.page.getByRole('button',{name:'Agrandir le jeu',exact:true}).click();await x.page.locator('[data-expansion=native]').waitFor();await x.page.getByRole('button',{name:'Quitter le plein écran',exact:true}).click();await restored(x);assert.deepEqual(await x.page.evaluate(()=>({enter:window.testCalls.enter,exit:window.testCalls.exit})),{enter:1,exit:1})}finally{await x.context.close()}
 })
 await test(`${engine}: actual native API or automatic fallback`,async()=>{const x=await setup({api:'actual',viewport:{width:1024,height:768}});try{await x.page.getByRole('button',{name:'Agrandir le jeu',exact:true}).click();await x.page.waitForFunction(()=>['native','immersive'].includes(document.querySelector('[data-expansion]').dataset.expansion));const mode=await x.page.locator('[data-expansion]').getAttribute('data-expansion');console.log(engine+' actual fullscreen outcome: '+mode);if(engine==='chromium')assert.equal(mode,'native');await x.page.locator('[data-player-expand]').click();await restored(x)}finally{await x.context.close()}})
 await test(`${engine}: viewport, orientation, Escape, new portal content and teardown restore the site`,async()=>{
  const x=await setup();try{
   for(const size of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1024,height:768}]){
    await x.page.setViewportSize(size);await x.page.locator('[data-player-expand]').click();await x.page.locator('[data-expansion=immersive]').waitFor()
    for(const next of [{width:size.height,height:size.width},size]){await x.page.setViewportSize(next);await x.page.waitForFunction(()=>{const b=document.querySelector('[data-expansion]').getBoundingClientRect();return Math.abs(b.width-visualViewport.width)<1&&Math.abs(b.height-visualViewport.height)<1})}
    await x.page.evaluate(()=>{const n=document.createElement('button');n.id='late-notice';n.textContent='Notification';document.body.append(n);window.dispatchEvent(new Event('orientationchange'));visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'))})
    await x.page.waitForFunction(()=>document.querySelector('#late-notice').inert);assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    const button=await x.page.locator('[data-player-expand]').boundingBox(),view=await x.page.evaluate(()=>({width:visualViewport.width,height:visualViewport.height}));assert.ok(button.x>=0&&button.y>=0&&button.x+button.width<=view.width+1&&button.y+button.height<=view.height+1)
    await x.page.screenshot({path:join(output,`${engine}-immersive-${size.width}x${size.height}.png`)})
    await x.page.keyboard.press('Escape');await restored(x);assert.equal(await x.page.locator('#late-notice').evaluate(e=>e.inert),false);await x.page.locator('#late-notice').evaluate(e=>e.remove())
   }
   await x.page.locator('[data-player-expand]').click();await x.page.locator('[data-expansion=immersive]').waitFor();await x.page.evaluate(()=>window.unmountPlayer());await x.page.waitForFunction(()=>document.body.style.position!=='fixed');assert.equal(await x.page.locator('#portal-nav').evaluate(e=>e.inert),false);assert.equal(await x.page.locator('iframe').count(),0)
  }finally{await x.context.close()}
 })
 await test(`${engine}: late native resolution after unmount cannot lock the portal`,async()=>{
  const x=await setup({api:'pending'});try{await x.page.locator('[data-player-expand]').click();await x.page.evaluate(()=>window.unmountPlayer());await x.page.evaluate(()=>window.finishNative());await x.page.waitForTimeout(30);assert.equal(await x.page.locator('#portal-nav').evaluate(e=>e.inert),false);assert.notEqual(await x.page.evaluate(()=>document.body.style.position),'fixed');assert.equal(await x.page.evaluate(()=>document.fullscreenElement),null)}finally{await x.context.close()}
 })
 await test(`${engine}: visual viewport offsets, scroll lock and game exit`,async()=>{
  const x=await setup();try{await x.page.locator('[data-player-expand]').click();await x.page.locator('[data-expansion=immersive]').waitFor();await x.page.evaluate(()=>{for(const[name,value]of Object.entries({width:300,height:500,offsetLeft:12,offsetTop:45}))Object.defineProperty(visualViewport,name,{configurable:true,value});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'))});await x.page.waitForFunction(()=>document.querySelector('[data-expansion]').getBoundingClientRect().height===500);const b=await x.page.locator('[data-expansion]').boundingBox();assert.deepEqual({x:b.x,y:b.y,width:b.width,height:b.height},{x:12,y:45,width:300,height:500});await x.page.mouse.wheel(0,700);assert.equal(await x.page.evaluate(()=>scrollY),0);await unchanged(x);await x.page.getByRole('button',{name:'Quitter le jeu',exact:true}).click();await restored(x);assert.equal(await x.page.locator('#left-game').innerText(),'left')}finally{await x.context.close()}
 })
 await test(`${engine}: repeated clicks and a late native result cannot reopen a reduced player`,async()=>{
  const x=await setup({api:'pending'});try{await x.page.evaluate(()=>{const button=document.querySelector('[data-player-expand]');button.click();button.click()});await x.page.locator('[data-expansion=immersive]').waitFor();assert.equal(await x.page.evaluate(()=>window.testCalls.enter),1);await x.page.locator('[data-player-expand]').click();await restored(x);await x.page.evaluate(()=>window.finishNative());await x.page.waitForFunction(()=>document.fullscreenElement===null);await restored(x)}finally{await x.context.close()}
 })
 assert.deepEqual(errors,[])
}finally{await browser.close()}

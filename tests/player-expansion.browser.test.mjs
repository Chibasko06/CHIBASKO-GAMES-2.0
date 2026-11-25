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
async function setup({api='absent',kind='sdk',sizing,freehead=false,viewport={width:390,height:844}}={}){
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
  if(u.hostname==='play.example.com'&&freehead)return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:black;overflow:hidden"><div id="stage" style="position:absolute;background:#ddd;display:grid;place-items:center"><button id="play" style="width:160px;height:80px">Jouer</button></div><script>window.instance=crypto.randomUUID();window.moves=0;document.querySelector('button').onclick=()=>window.moves++;function resize(){const w=Math.min(innerWidth,innerHeight*720/405),h=w*405/720;Object.assign(document.querySelector('#stage').style,{width:w+'px',height:h+'px',left:(innerWidth-w)/2+'px',top:(innerHeight-h)/2+'px'})}function tick(){resize();requestAnimationFrame(tick)}tick();addEventListener('resize',resize);parent.postMessage('fixture-ready','*')</script>`});
  if(u.hostname==='play.example.com')return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;background:#164e63;color:white;display:grid;place-items:center;height:100vh"><button id="play" style="width:160px;height:80px">Jouer</button><script>window.instance=crypto.randomUUID();window.moves=0;document.querySelector('button').onclick=()=>{window.moves++;document.querySelector('button').textContent='Actions '+window.moves};parent.postMessage('fixture-ready','*')</script>`})
  if(u.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(script)})
  if(u.pathname==='/host.css')return route.fulfill({contentType:'text/css',body:Buffer.from(css)})
  if(u.pathname==='/logo-chibaskogames-rond.ico')return route.fulfill({contentType:'image/x-icon',body:await readFile('public/logo-chibaskogames-rond.ico')})
  return route.fulfill({contentType:'text/html',body:`<!doctype html><html style="scroll-behavior:smooth"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/host.css"><style>body{margin:0;color:white;background:#09090b}header{position:sticky;top:0;z-index:20;background:red;height:90px}main{position:relative;z-index:0;transform:translateZ(0);contain:paint;overflow:hidden}.before{height:500px}.after{height:900px}button{min-width:44px;min-height:44px}</style><body style="overflow-x:clip"><header id="portal-nav" aria-hidden="false"><button>Compte</button></header><main id="main" style="isolation:isolate"><div class="before" id="before">Avant le jeu</div><div id="player"></div><div class="after" id="after" style="opacity:.8">Après le jeu</div></main><footer id="footer" inert>Footer</footer><script src="/host.js"></script>`})
 })
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://portal.test/game?kind='+kind+(sizing?'&sizing='+sizing:''));await page.frameLocator('iframe').locator('#play').waitFor()
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
    const frameBox=await x.page.locator('iframe').boundingBox(),hit=await x.frame.evaluate(()=>{const r=document.querySelector('#play').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth,h:innerHeight}});await x.page.touchscreen.tap(frameBox.x+hit.x*frameBox.width/hit.w,frameBox.y+hit.y*frameBox.height/hit.h);assert.equal(await x.frame.evaluate(()=>window.moves),i+1)
    await x.page.getByRole('button',{name:'Ouvrir les commandes',exact:true}).click();await x.page.getByRole('button',{name:'Couper le son',exact:true}).click();await x.page.getByRole('button',{name:'Réactiver le son',exact:true}).click()
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
  const x=await setup();try{await x.page.locator('[data-player-expand]').click();await x.page.locator('[data-expansion=immersive]').waitFor();await x.page.evaluate(()=>{for(const[name,value]of Object.entries({width:300,height:500,offsetLeft:12,offsetTop:45}))Object.defineProperty(visualViewport,name,{configurable:true,value});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'))});await x.page.waitForFunction(()=>document.querySelector('[data-expansion]').getBoundingClientRect().height===500);const b=await x.page.locator('[data-expansion]').boundingBox();assert.deepEqual({x:b.x,y:b.y,width:b.width,height:b.height},{x:12,y:45,width:300,height:500});await x.page.mouse.wheel(0,700);assert.equal(await x.page.evaluate(()=>scrollY),0);await unchanged(x);await x.page.getByRole('button',{name:'Ouvrir les commandes',exact:true}).click();await x.page.getByRole('button',{name:'Quitter le jeu',exact:true}).click();await restored(x);assert.equal(await x.page.locator('#left-game').innerText(),'left')}finally{await x.context.close()}
 })
 await test(`${engine}: repeated clicks and a late native result cannot reopen a reduced player`,async()=>{
  const x=await setup({api:'pending'});try{await x.page.evaluate(()=>{const button=document.querySelector('[data-player-expand]');button.click();button.click()});await x.page.locator('[data-expansion=immersive]').waitFor();assert.equal(await x.page.evaluate(()=>window.testCalls.enter),1);await x.page.locator('[data-player-expand]').click();await restored(x);await x.page.evaluate(()=>window.finishNative());await x.page.waitForFunction(()=>document.fullscreenElement===null);await restored(x)}finally{await x.context.close()}
 })
 for(const kind of ['classic','sdk','external','legacy'])for(const sizing of ['fixed','responsive'])await test(`${engine}: ${kind} with ${sizing} sizing fits portrait and landscape without replacing the frame`,async()=>{
  const x=await setup({kind,sizing});try{
   for(const size of [{width:390,height:844},{width:844,height:390}]){
    await x.page.setViewportSize(size);await x.page.locator('[data-player-expand]').click();await x.page.locator('[data-expansion=immersive]').waitFor();await x.page.waitForTimeout(40)
    const surface=await x.page.locator('[data-player-surface]').boundingBox(),content=await x.page.locator('[data-frame-content]').boundingBox(),inside=await x.frame.evaluate(()=>({w:innerWidth,h:innerHeight}))
    assert.equal(await x.page.locator('[data-player-sizing]').getAttribute('data-player-sizing'),sizing)
    assert.ok(Math.abs(surface.height-size.height)<1&&Math.abs(surface.width-size.width)<1,'no permanent dock row')
    assert.ok(content.x>=surface.x-1&&content.y>=surface.y-1&&content.x+content.width<=surface.x+surface.width+1&&content.y+content.height<=surface.y+surface.height+1)
    if(sizing==='fixed'){assert.ok(Math.abs(content.width/content.height-16/9)<.001);assert.deepEqual(inside,{w:1280,h:720})}else assert.deepEqual({w:Math.round(content.width),h:Math.round(content.height)},inside)
    await x.page.getByRole('button',{name:'Ouvrir les commandes',exact:true}).click();await x.page.getByRole('button',{name:'J’aime',exact:true}).click();assert.ok(await x.page.getByRole('button',{name:'J’aime',exact:true}).getAttribute('data-count'));const previous=await x.page.locator('[data-controls-corner]').getAttribute('data-controls-corner');await x.page.getByRole('button',{name:'Déplacer les commandes',exact:true}).click();assert.notEqual(await x.page.locator('[data-controls-corner]').getAttribute('data-controls-corner'),previous)
    assert.deepEqual(await x.page.locator('[data-frame-content]').boundingBox(),content,'the command panel does not resize the game')
    await x.page.keyboard.press('Escape');assert.equal(await x.page.locator('[data-expansion=immersive]').count(),1);assert.equal(await x.page.getByRole('button',{name:'J’aime',exact:true}).count(),0)
    const control=await x.page.locator('[data-player-expand]').boundingBox();assert.ok(control.width>=44&&control.height>=44&&control.x>=0&&control.y>=0&&control.x+control.width<=size.width+1&&control.y+control.height<=size.height+1)
    await x.page.locator('[data-player-expand]').click();await restored(x)
   }
  }finally{await x.context.close()}
 })
 await test(`${engine}: Freehead Skate layout gains landscape surface while retaining 720:405`,async()=>{
  const measured=[]
  for(const sizing of ['fixed','responsive'])for(const orientation of ['landscape','portrait']){
   const landscape=orientation==='landscape',viewport=landscape?{width:844,height:281}:{width:390,height:844},x=await setup({kind:'legacy',sizing,freehead:true,viewport})
   try{
    const dockHeight=(await x.page.locator('[data-player-dock]').boundingBox()).height
    await x.page.evaluate(landscape=>{const e=document.querySelector('[data-expansion]');for(const[name,value]of Object.entries(landscape?{left:59,right:59,bottom:20,top:0}:{left:0,right:0,top:47,bottom:34}))e.style.setProperty('--player-safe-'+name,value+'px')},landscape)
    await x.page.locator('[data-player-expand]').click();await x.page.locator('[data-expansion=immersive]').waitFor();await x.frame.waitForFunction(()=>document.querySelector('#stage').getBoundingClientRect().width>0);await x.page.waitForTimeout(250)
    const surface=await x.page.locator('[data-player-surface]').boundingBox(),f=await x.page.locator('iframe').boundingBox(),inside=await x.frame.evaluate(()=>{const r=document.querySelector('#stage').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,w:innerWidth,h:innerHeight}}),game={x:f.x+inside.x*f.width/inside.w,y:f.y+inside.y*f.height/inside.h,width:inside.width*f.width/inside.w,height:inside.height*f.height/inside.h}
    const oldWidth=Math.min(surface.width,(surface.height-dockHeight)*16/9),expected=Math.min(surface.width,surface.height*16/9),gain=100*(game.width/oldWidth-1)
    assert.ok(Math.abs(game.width/game.height-16/9)<.001&&Math.abs(game.width-expected)<1,JSON.stringify({sizing,orientation,surface,f,inside,game,expected}))
    if(landscape)assert.ok(gain>25&&gain<32);else assert.ok(Math.abs(gain)<.1)
    const controls=await x.page.locator('[data-player-dock]').boundingBox();assert.ok(controls.x+controls.width<=game.x+1||controls.y+controls.height<=game.y+1||controls.x>=game.x+game.width-1||controls.y>=game.y+game.height-1,'closed controls stay in the known margins')
    measured.push({sizing,orientation,viewport,surface:{width:surface.width,height:surface.height},oldDockHeight:dockHeight,oldGameWidth:oldWidth,game:{width:game.width,height:game.height},linearGainPercent:Number(gain.toFixed(2))})
    await x.page.screenshot({path:join(output,`${engine}-freehead-layout-${sizing}-${orientation}.png`)});await unchanged(x);await x.page.locator('[data-player-expand]').click();await restored(x)
   }finally{await x.context.close()}
  }
  console.log('FREEHEAD_LAYOUT_MEASUREMENTS '+JSON.stringify(measured))
 })
 await test(`${engine}: compact commands remain touchable in a short landscape viewport`,async()=>{
  const x=await setup({viewport:{width:844,height:190}});try{
   await x.page.locator('[data-player-expand]').click();await x.page.locator('[data-expansion=immersive]').waitFor();await x.page.getByRole('button',{name:'Ouvrir les commandes',exact:true}).click();await x.page.getByRole('button',{name:'Déplacer les commandes',exact:true}).scrollIntoViewIfNeeded()
   const panel=await x.page.locator('[data-player-dock]').boundingBox(),exit=await x.page.locator('[data-player-expand]').boundingBox();assert.ok(panel.y>=0&&panel.y+panel.height<=190&&exit.y>=panel.y&&exit.y+exit.height<=panel.y+panel.height+1);assert.ok(exit.width>=44&&exit.height>=44)
   await x.page.locator('[data-player-expand]').tap();await restored(x)
  }finally{await x.context.close()}
 })
 assert.deepEqual(errors,[])
}finally{await browser.close()}

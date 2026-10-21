import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {gameLaunchRequest} from '../lib/server/gameLaunches.ts'
import {assertPlayerLayout} from './helpers/player-layout.mjs'

let browser,js,css
before(async()=>{
  const result=await build({entryPoints:['tests/fixtures/runtime-host.tsx'],bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,metafile:true,outdir:'.distribution/runtime-browser',define:{'process.env.NODE_ENV':'"production"'}})
  assert.ok(!Object.keys(result.metafile.inputs).some(path=>/node_modules\/(?:next|@chibaskogames)|^games\/|game-server\//.test(path)))
  js=result.outputFiles.find(f=>f.path.endsWith('.js')).contents;css=result.outputFiles.find(f=>f.path.endsWith('.css')).contents
  browser=await chromium.launch({channel:process.env.RUNTIME_BROWSER_CHANNEL ?? 'chrome',headless:true,args:['--test-third-party-cookie-phaseout']})
  console.log('Real browser:',browser.version(),'; third-party-cookie blocking flag enabled; all HTTPS routes intercepted locally.')
})
after(async()=>{await browser?.close()})
test('non-PSL sibling cookies cannot authorize a revoked launch; origins retain separate storage',async()=>{
  const base='chibaskogames-play.fr',h=await runtimeHarness('solo','preview','normal',{
    publicBase:base,previewBase:base,contentBase:base,portalOrigins:['https://portal.test']})
  const a=await h.client.create(h.request),b=await h.client.create(h.request)
  const context=await browser.newContext(),cookies=[]
  try {
    await context.route('**/*',async route=>{
      const request=route.request(),headers=await request.allHeaders()
      cookies.push(headers.cookie ?? '')
      const response=await h.gateway(new Request(request.url(),{method:request.method(),headers}))
      assert.equal(response.headers.get('set-cookie'),null)
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
    })
    const page=await context.newPage()
    await page.goto(a.descriptor.entrypointUrl)
    await page.evaluate(()=>{
      document.cookie='shared_fixture=yes; Domain=chibaskogames-play.fr; Path=/; Secure; SameSite=Lax'
      localStorage.setItem('private_launch','A')
    })
    await page.goto(b.descriptor.entrypointUrl)
    assert.match(await page.evaluate(()=>document.cookie),/shared_fixture=yes/)
    assert.equal(await page.evaluate(()=>localStorage.getItem('private_launch')),null)
    await h.client.release(a)
    const response=await page.goto(a.descriptor.entrypointUrl)
    assert.equal(response.status(),403)
    assert.ok(cookies.some(cookie=>cookie.includes('shared_fixture=yes')))
  }finally{await context.close()}
})
async function setup(kind='solo',audience='published',behavior='normal',viewport={width:1366,height:768},clock=false,base='github.io') {
  const h=await runtimeHarness(kind,audience,behavior,{publicBase:base,previewBase:base,contentBase:base,portalOrigins:['https://portal.test']}),context=await browser.newContext({viewport,serviceWorkers:'block'}),requests=[]
  await context.addCookies([{name:'portal-auth-fixture',value:'not-a-real-session',domain:'portal.test',path:'/',secure:true,sameSite:'None'}])
  await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url()),headers=await r.allHeaders();requests.push({host:url.hostname,path:url.pathname,cookie:headers.cookie ?? ''})
    let response
    if(url.hostname==='portal.test') {
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link rel="stylesheet" href="/host.css"></head><body style="margin:0"><script src="/host.js"></script></body></html>'})
      if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(js)})
      if(url.pathname==='/host.css')return route.fulfill({contentType:'text/css',body:Buffer.from(css)})
      if(url.pathname==='/logo-chibaskogames-rond.ico')return route.fulfill({contentType:'image/x-icon',body:readFileSync('public/logo-chibaskogames-rond.ico')})
      if(url.pathname.startsWith('/api/game-launches')) {
        const req=new Request(r.url(),{method:r.method(),headers,...(r.postData()?{body:r.postData()}: {})})
        const id=url.pathname.split('/')[3]
        response=await gameLaunchRequest(req,id,{actor:async req=>req.headers.has('authorization')?'owner':null,service:()=>h.service})
      }
    }else if(url.hostname.startsWith('l-') && url.hostname.endsWith('.'+base)) {
      response=await h.gateway(new Request(r.url(),{method:r.method(),headers}))
    }
    if(!response)return route.fulfill({status:404,body:''})
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
  })
  const page=await context.newPage();if(clock){await page.clock.install();h.clock.fixed=Date.now()}
  // Server and browser virtual time must not diverge with the host test's wall time.
  await page.goto('https://portal.test/');await page.waitForFunction(()=>!!window.runtimeFixture)
  await page.evaluate(request=>window.runtimeFixture.open(request),h.request)
  return {h,context,page,requests,async running(){await page.locator('[data-phase="running"]').waitFor();return page.frames().find(f=>new URL(f.url()).hostname.startsWith('l-'))}}
}
test('browser non-PSL preview descriptor creates iframe, loads entrypoint and completes Bridge v2',async()=>{
  const x=await setup('solo','preview','normal',{width:1366,height:768},false,'chibaskogames-play.fr')
  try {
    const frame=await x.running(),firstOrigin=new URL(frame.url()).origin
    assert.equal((await frame.evaluate(()=>fixture.context)).execution,'local')
    assert.ok(x.requests.some(r=>r.host.endsWith('.chibaskogames-play.fr') && r.path==='/play/start.html'))
    await frame.evaluate(()=>location.reload())
    await x.page.locator('[data-phase="failed"]').waitFor()
    await x.page.getByRole('button',{name:'Réessayer'}).click()
    const second=await x.running()
    assert.notEqual(new URL(second.url()).origin,firstOrigin)
  }finally{await x.context.close()}
})
for(const [kind,audience] of [['pong-like','published'],['solo','preview'],['online','published']])test('browser iframe handshake, safe '+kind+' / '+audience+' context, no third-party-cookie dependency',async()=>{
  const x=await setup(kind,audience)
  try {
    const frame=await x.running(),context=await frame.evaluate(()=>window.fixture.context)
    assert.equal(context.execution,x.h.request.execution)
    assert.ok(frame.url().includes(kind==='solo'?'/play/start.html':'/index.html'))
    assert.doesNotMatch(JSON.stringify(context),/token|supabase|reservation|roomId|email|controlToken/i)
    assert.ok(x.requests.filter(r=>r.host.endsWith('.github.io')).every(r=>!r.cookie.includes('portal-auth-fixture')))
    assert.equal(await frame.evaluate(async()=>[...new Uint8Array(await (await fetch('/asset.data')).arrayBuffer())].join(',')),'1,2,3,4')
    assert.equal(await x.page.locator('iframe').getAttribute('sandbox'),'allow-scripts allow-same-origin allow-pointer-lock')
    const top=x.page.url()
    await frame.evaluate(()=>{try{top.location.href='https://escape.test/'}catch{}})
    assert.equal(x.page.url(),top)
    await frame.evaluate(()=>window.fixture.send('LEAVE_REQUEST'))
    await x.page.getByText('Jeu quitté',{exact:true}).waitFor();assert.equal(await x.page.locator('iframe').count(),0)
    assert.equal(x.h.released.length,1)
  }finally{await x.context.close()}
})
test('browser missing SDK has a finite handshake timeout and keeps Quitter outside the iframe',async()=>{
  const x=await setup('solo','published','no-sdk',{width:1366,height:768},true)
  try {
    await x.page.frameLocator('iframe').getByRole('heading',{name:'Solo fixture'}).waitFor()
    await x.page.clock.fastForward(31000)
    await x.page.locator('[data-phase="failed"]').waitFor()
    await x.page.getByText('Le jeu n’a pas terminé son initialisation.',{exact:true}).waitFor()
    await x.page.getByRole('button',{name:'Quitter le jeu'}).click();await x.page.getByText('Jeu quitté',{exact:true}).waitFor()
  }finally{await x.context.close()}
})
test('browser public-suffix cookie boundary rejects sibling supercookies even in top-level context',async()=>{
  const x=await setup()
  try {
    await x.running();const a=await x.h.client.create(x.h.request),b=await x.h.client.create(x.h.request),page=await x.context.newPage()
    await page.goto(a.descriptor.entrypointUrl)
    const cookies=await page.evaluate(()=>{document.cookie='host_only=A;SameSite=Lax;Secure';document.cookie='parent_shared=A;Domain=github.io;SameSite=Lax;Secure';return document.cookie})
    assert.ok(cookies.includes('host_only=A'));assert.ok(!cookies.includes('parent_shared'))
    await page.goto(b.descriptor.entrypointUrl);assert.equal(await page.evaluate(()=>document.cookie),'')
  }finally{await x.context.close()}
})
test('browser storage, IndexedDB, cookies and BroadcastChannel are separate between simultaneous launches and after retry',async()=>{
  const x=await setup()
  try {
    const a=await x.running();await x.page.evaluate(req=>window.runtimeFixture.open(req),x.h.request)
    await x.page.waitForFunction(()=>document.querySelectorAll('[data-phase="running"]').length===2)
    const b=x.page.frames().filter(f=>f.url().startsWith('https://l-'))[1]
    assert.notEqual(new URL(a.url()).origin,new URL(b.url()).origin)
    await a.evaluate(async()=>{localStorage.setItem('isolation','A');window.channel=new BroadcastChannel('shared');document.cookie='shared_cookie=A;Domain=github.io;SameSite=None;Secure';await new Promise((resolve,reject)=>{const q=indexedDB.open('isolation',1);q.onupgradeneeded=()=>q.result.createObjectStore('data');q.onsuccess=()=>{q.result.close();resolve()};q.onerror=()=>reject(q.error)})})
    const isolated=await b.evaluate(async()=>{window.channel=new BroadcastChannel('shared');window.heard=false;window.channel.onmessage=()=>window.heard=true;return {local:localStorage.getItem('isolation'),cookie:document.cookie,db:(await indexedDB.databases()).map(d=>d.name)}})
    assert.equal(isolated.local,null);assert.ok(!isolated.cookie.includes('shared_cookie'));assert.ok(!isolated.db.includes('isolation'))
    await a.evaluate(()=>window.channel.postMessage('secret'));await x.page.waitForTimeout(100)
    assert.equal(await b.evaluate(()=>window.heard),false)
    await a.evaluate(()=>location.reload());await x.page.locator('[data-phase="failed"]').waitFor()
    const oldOrigin=new URL(a.url()).origin
    await x.page.getByRole('button',{name:'Réessayer'}).click()
    await x.page.waitForFunction(()=>document.querySelectorAll('[data-phase="running"]').length===2)
    assert.ok(x.page.frames().filter(f=>f.url().startsWith('https://l-')).every(f=>new URL(f.url()).origin!==oldOrigin))
    await x.page.evaluate(()=>window.runtimeFixture.unmount());await x.page.waitForTimeout(100)
    assert.equal(await x.page.locator('iframe').count(),0);assert.equal(x.h.released.length,3)
  }finally{await x.context.close()}
})
test('browser ignores forged messages and detects iframe navigation without losing the external exit control',async()=>{
  const x=await setup()
  try {
    const frame=await x.running()
    await x.page.evaluate(()=>window.postMessage({channel:'chibasko.game',type:'LEAVE_REQUEST'},location.origin))
    await frame.evaluate(()=>parent.postMessage({...window.fixture.envelope,generation:crypto.randomUUID(),type:'GAME_ERROR',payload:{documentId:window.fixture.documentId,code:'forged'}},new URLSearchParams(location.hash.slice(1)).get('cgParent')))
    await frame.evaluate(()=>parent.postMessage({...window.fixture.envelope,protocolVersion:2,type:'LEAVE_REQUEST',payload:{documentId:window.fixture.documentId}},new URLSearchParams(location.hash.slice(1)).get('cgParent')))
    assert.equal(await x.page.locator('[data-phase="running"]').count(),1)
    await frame.evaluate(()=>location.assign(new URL('/missing.html',location.href).href)).catch(()=>{})
    await x.page.locator('[data-phase="failed"]').waitFor()
    await x.page.getByRole('button',{name:'Quitter le jeu'}).click();await x.page.getByText('Jeu quitté',{exact:true}).waitFor()
  }finally{await x.context.close()}
})
test('browser fullscreen is host-controlled and hides the dock',async()=>{
  const x=await setup()
  try {
    const frame=await x.running()
    await frame.evaluate(()=>{const button=document.createElement('button');button.textContent='Fullscreen fixture';button.onclick=()=>{document.body.requestFullscreen().then(()=>window.childFullscreen='allowed',()=>window.childFullscreen='denied')};document.body.append(button)})
    await x.page.frameLocator('iframe').getByRole('button',{name:'Fullscreen fixture'}).click()
    await frame.waitForFunction(()=>window.childFullscreen==='denied')
    await x.page.getByRole('button',{name:'Plein écran',exact:true}).click()
    await x.page.waitForFunction(()=>document.fullscreenElement?.getAttribute('aria-label')==='Jeu Chibasko Games')
    assert.equal(await x.page.getByRole('button',{name:'Quitter le jeu'}).isVisible(),false)
    await assertPlayerLayout(x.page,true)
    await x.page.evaluate(()=>document.exitFullscreen())
    await x.page.waitForFunction(()=>document.fullscreenElement===null)
    await x.page.getByRole('button',{name:'Plein écran',exact:true}).waitFor()
  }finally{await x.context.close()}
})
test('attached dock retains accessible labels, keyboard focus, tooltips and exit',async()=>{
  const x=await setup()
  try{
    await x.running()
    await x.page.keyboard.press('Tab')
    const audio=x.page.getByLabel('Ce jeu ne prend pas en charge le contrôle audio',{exact:true}).filter({has:x.page.getByRole('button')})
    assert.equal(await audio.evaluate(node=>document.activeElement===node),true)
    assert.equal(await audio.locator('span').isVisible(),true)
    assert.equal(await audio.getByRole('button').isDisabled(),true)
    await x.page.keyboard.press('Tab')
    const fullscreen=x.page.getByRole('button',{name:'Plein écran',exact:true})
    assert.equal(await fullscreen.evaluate(node=>document.activeElement===node),true)
    assert.equal(await fullscreen.locator('span').isVisible(),true)
    await x.page.keyboard.press('Tab')
    const exit=x.page.getByRole('button',{name:'Quitter le jeu'})
    assert.equal(await exit.evaluate(node=>document.activeElement===node),true)
    assert.equal(await exit.locator('span').isVisible(),true)
    await x.page.keyboard.press('Enter')
    await x.page.getByText('Jeu quitté',{exact:true}).waitFor()
    assert.equal(await x.page.locator('iframe').count(),0)
  }finally{await x.context.close()}
})
for(const viewport of [{width:1366,height:768},{width:1920,height:1080},{width:390,height:844},{width:768,height:1024},{width:844,height:390}])test('browser responsive '+viewport.width+'x'+viewport.height+' preserves accessible dock and iframe bounds with normal page scrolling',async()=>{
  const x=await setup('solo','published','normal',viewport)
  try {
    await x.running()
    const iframe=await x.page.locator('iframe').boundingBox(),exit=await x.page.getByRole('button',{name:'Quitter le jeu'}).boundingBox()
    assert.ok(iframe.width<=viewport.width && iframe.height>100);assert.ok(exit.y>=iframe.y+iframe.height-1)
    assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    assert.equal(await x.page.getByText('Partie en cours',{exact:true}).count(),0)
    assert.equal(await x.page.locator('[role="status"]').count(),0)
    await assertPlayerLayout(x.page)
    const controls=x.page.getByRole('button',{name:'Quitter le jeu'})
    await controls.scrollIntoViewIfNeeded()
    assert.equal(await controls.evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node || node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true)
    if(viewport.width===390)assert.ok(exit.width>=44 && exit.height>=44)
    if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:`.distribution/runtime-${viewport.width}x${viewport.height}.png`})
  }finally{await x.context.close()}
})

async function loadingFrame(x){await x.page.frameLocator('iframe').getByRole('heading',{name:'Solo fixture'}).waitFor();const frame=x.page.frames().find(f=>f.url().startsWith('https://l-'));for(let i=0;i<100;i++){if(await frame.evaluate(()=>!!window.fixture?.context && fixture.pings>0))return frame;await x.page.waitForTimeout(5)}throw new Error('Bridge fixture did not initialize')}
async function tickHeartbeat(x,frame){const before=await frame.evaluate(()=>fixture.pings);await x.page.clock.fastForward(10_000);for(let i=0;i<100;i++){if(await frame.evaluate(before=>fixture.pings>before,before)){await x.page.waitForTimeout(5);return}await x.page.waitForTimeout(5)}throw new Error('Expected fixture heartbeat')}

test('browser long application loading stays alive after 30 seconds and starts only at late READY',async()=>{
  const x=await setup('solo','published','slow-assets',{width:1366,height:768},true)
  try{
    const frame=await loadingFrame(x)
    for(let i=0;i<8;i++)await tickHeartbeat(x,frame)
    assert.equal(await x.page.locator('[data-phase="loading"]').count(),1);assert.equal(await frame.evaluate(()=>fixture.starts),0)
    await x.page.clock.fastForward(10_000);await x.running();assert.equal(await frame.evaluate(()=>fixture.starts),1)
  }finally{await x.context.close()}
})

test('browser detects a bridge that dies during loading, separately from missing INIT acknowledgement',async()=>{
  for(const [behavior,seconds]of [['loading-no-pong',40],['no-init-ack',5]]){
    const x=await setup('solo','published',behavior,{width:1366,height:768},true)
    try{const frame=await loadingFrame(x);for(let i=0;i<seconds;i+=5){await x.page.clock.fastForward(5_000);await x.page.waitForTimeout(5)}await x.page.locator('[data-phase="failed"]').waitFor();assert.equal(await x.page.locator('iframe').count(),0);assert.equal(frame.isDetached(),true)}finally{await x.context.close()}
  }
})

test('browser retry after HELLO timeout creates a fresh launch/generation and ignores stale messages',async()=>{
  const x=await setup('solo','published','no-sdk',{width:1366,height:768},true)
  try{
    await x.page.frameLocator('iframe').getByRole('heading',{name:'Solo fixture'}).waitFor();const first=[...x.h.sessions.values()][0]
    await x.page.clock.fastForward(16_000);await x.page.locator('[data-phase="failed"]').waitFor()
    for(const [path,bytes]of x.h.files)if(path.endsWith('.html'))x.h.files.set(path,new TextEncoder().encode(new TextDecoder().decode(bytes).replace('data-behavior="no-sdk"','data-behavior="normal"')))
    await x.page.getByRole('button',{name:'Réessayer'}).click();const frame=await x.running(),second=[...x.h.sessions.values()][1]
    assert.notEqual(first.generation,second.generation);assert.notEqual(first.id,second.id);assert.equal(first.revoked,true)
    await frame.evaluate(first=>parent.postMessage({...fixture.envelope,generation:first.generation,launchId:first.id,type:'GAME_ERROR',payload:{documentId:fixture.documentId,code:'stale'}},new URLSearchParams(location.hash.slice(1)).get('cgParent')),{generation:first.generation,id:first.id})
    assert.equal(await x.page.locator('[data-phase="running"]').count(),1)
  }finally{await x.context.close()}
})

for(const audience of ['published','preview'])test('browser '+audience+' renews artifact access and lazy-loads after 45 minutes without replacing iframe',async()=>{
  const x=await setup('solo',audience,'normal',{width:1366,height:768},true)
  try{
    const frame=await x.running(),origin=new URL(frame.url()).origin
    for(let i=1;i<=9;i++){
      x.h.clock.offset=i*300_000
      // Heartbeats are event-loop liveness signals, not lease renewal credentials.
      // Execute each interval so no unanswered heartbeat is artificially skipped.
      for(let j=0;j<30;j++)await tickHeartbeat(x,frame)
      await x.page.waitForFunction(()=>document.querySelector('[data-phase="running"]')!==null)
      for(let n=0;n<100 && x.h.calls.filter(c=>c==='distribution_renew_launch').length<i;n++)await x.page.waitForTimeout(10)
      assert.ok(x.h.calls.filter(c=>c==='distribution_renew_launch').length>=i)
    }
    assert.equal(new URL(frame.url()).origin,origin);assert.equal(x.h.sessions.size,1)
    assert.deepEqual(await frame.evaluate(async()=>[...new Uint8Array(await (await fetch('/asset.data')).arrayBuffer())]),[1,2,3,4])
    assert.equal(await x.page.locator('[data-phase="running"]').count(),1)
  }finally{await x.context.close()}
})

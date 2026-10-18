import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {randomUUID,randomBytes} from 'node:crypto'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'

// Consumers install the published v1 package and the v2 tarball outside this repository.
const v1=process.env.SDK_V1_CONSUMER_DIRECTORY,v2=process.env.SDK_V2_CONSUMER_DIRECTORY
if(!v1 || !v2)throw Error('SDK_V1_CONSUMER_DIRECTORY and SDK_V2_CONSUMER_DIRECTORY are required')
const runtime=(await build({stdin:{contents:"import {mountGameRuntime} from './lib/game-runtime/controller';import {httpLaunchClient} from './lib/game-runtime/client';window.mountRuntime=mountGameRuntime;window.launchClient=httpLaunchClient",resolveDir:process.cwd()},bundle:true,platform:'browser',format:'iife',write:false})).outputFiles[0].text
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--test-third-party-cookie-phaseout']})
try {
 for(const [version,directory] of [[1,v1],[2,v2]])for(const execution of ['local','online'])await test(`Chrome actual runtime + installed SDK Bridge v${version}, ${execution}`,async()=>{
  const pkg=JSON.parse(await readFile(join(directory,'node_modules/@chibaskogames/sdk/package.json'),'utf8'))
  assert.equal(pkg.version,version===1?'0.2.0':'0.3.0')
  const sdk=await readFile(join(directory,'node_modules/@chibaskogames/sdk/dist/browser/chibasko-games-sdk.js'))
  const participant='p_'+'1'.repeat(32),session='s_'+'2'.repeat(32),gameId=randomUUID(),gameVersionId=randomUUID(),launchId=randomUUID(),generation=randomUUID()
  const roster=Array.from({length:version===2?128:2},(_,i)=>({participantId:'p_'+(i+1).toString(16).padStart(32,'0'),username:'Player '+i}))
  roster[0].participantId=participant
  const context={gameId,gameVersionId,execution,locale:'fr',participants:execution==='online'?roster:[],...(execution==='online'?{session:{sessionId:session,localParticipantIds:[participant]}}:{})}
  const bootstrap=execution==='local'?{execution:'local'}:{execution:'online',online:{onlineSessionId:session,participantId:participant,server:{endpoint:'wss://gameplay.chibaskogames.fr/',ticket:'a'.repeat(64),expiresAt:new Date(Date.now()+180000).toISOString()}}}
  const contentOrigin='https://l-'+randomBytes(24).toString('hex')+'.github.io',controlToken='c'.repeat(64)
  const descriptor={launchId,generation,context,bridgeVersion:2,contentOrigin,entrypointUrl:contentOrigin+'/game.html',gameId,gameVersionId,execution,integrationVersion:1,
   capabilities:{local:{players:{min:1,max:1}},online:{access:['public','private'],players:{min:2,max:128}}},iframeProfile:'web-v1',expiresAt:new Date(Date.now()+120000).toISOString()}
  const c=await browser.newContext({serviceWorkers:'block'})
  try{
   await c.route('**/*',async route=>{
    const u=new URL(route.request().url());let body,type='text/javascript'
    if(u.hostname==='portal.test'){
     if(u.pathname==='/'){type='text/html';body=`<script src="/runtime.js"></script><script>
      window.messages=[];window.mints=0;window.phases=[];window.failure=null;
      window.addEventListener('message',e=>{if(e.source===document.querySelector('iframe')?.contentWindow&&e.origin===${JSON.stringify(contentOrigin)})messages.push(e.data)});
      addEventListener('DOMContentLoaded',()=>{
       const client=launchClient(),start=client.start;client.start=(handle,signal)=>{mints++;return start(handle,signal)};
       const container=document.createElement('div');document.body.append(container);
       window.bridge=mountRuntime({container,client,request:${JSON.stringify({gameId,gameVersionId,execution,audience:'published',locale:'fr',...(execution==='online'?{onlineSessionReference:session}:{})})},onState:s=>{phases.push(s.phase);if(s.phase==='failed')failure=s.error},onLeave:()=>window.left=true});
      });</script>`}
     else if(u.pathname==='/runtime.js')body=runtime
     else if(u.pathname==='/api/game-launches'){type='application/json';body=JSON.stringify({data:{descriptor,controlToken}})}
     else if(u.pathname===`/api/game-launches/${launchId}/start`){
      const input=route.request().postDataJSON();assert.equal(input.controlToken,controlToken);assert.equal(input.generation,generation)
      type='application/json';body=JSON.stringify({data:bootstrap})
     }else if(u.pathname===`/api/game-launches/${launchId}`){await route.fulfill({status:204});return}
    }else if(u.origin===contentOrigin){
     if(u.pathname==='/sdk.js')body=sdk
     else if(u.pathname==='/game.html'){type='text/html';body=`<script src="/sdk.js"></script><script>
      window.starts=[];ChibaskoGames.connectPlatform().then(p=>{window.platform=p;p.onStart(c=>starts.push(c??null));p.onStop(()=>window.stopped=true)}).catch(e=>window.error=e.code);
      </script>`}
    }
    await route.fulfill({status:body===undefined?404:200,body:body??'',contentType:type,headers:{'Referrer-Policy':'no-referrer'}})
   })
   const page=await c.newPage();await page.goto('https://portal.test/')
   await page.frameLocator('iframe').locator('script[src="/sdk.js"]').waitFor({state:'attached'})
   const frame=page.frames().find(f=>f.url().startsWith(contentOrigin));assert.ok(frame)
   await frame.waitForFunction(()=>window.platform?.state==='initialized')
   assert.equal(await page.evaluate(()=>mints),0)
   assert.ok(!(await page.evaluate(()=>JSON.stringify(messages))).includes('ticket'))
   await frame.evaluate(()=>platform.ready());await frame.waitForFunction(()=>platform.state==='running')
   assert.equal(await page.evaluate(()=>failure),null)
   assert.equal(await page.evaluate(()=>messages[0].protocolVersion),version)
   if(version===2)assert.deepEqual(await frame.evaluate(()=>starts[0]),bootstrap)
   else assert.deepEqual(await frame.evaluate(()=>starts),[null])
   assert.equal(await page.evaluate(()=>mints),version===2&&execution==='online'?1:0)
   await page.evaluate(()=>bridge.stop());await frame.waitForFunction(()=>platform.state==='ready')
   await page.evaluate(()=>bridge.start());await frame.waitForFunction(()=>platform.state==='running')
   assert.equal(await page.evaluate(()=>mints),version===2&&execution==='online'?1:0)
   await frame.evaluate(()=>platform.close());await page.evaluate(()=>bridge.stop());assert.equal(await frame.evaluate(()=>platform.state),'closed')
   await page.evaluate(()=>bridge.dispose())
  }finally{await c.close()}
 })
 console.log('Chrome',browser.version(),': actual published SDK 0.2.0/v1 and packed SDK 0.3.0/v2; local/online, 128 participants, cross-origin START and teardown.')
}finally{await browser.close()}

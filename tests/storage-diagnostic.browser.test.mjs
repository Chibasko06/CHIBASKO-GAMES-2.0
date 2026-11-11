import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium,firefox,webkit} from '@playwright/test'
import {createArtifactGateway} from '../lib/game-distribution/gateway/gateway.ts'
import {localHTTPSFixture} from './helpers/local-https.mjs'

test('Diagnostic visible : deux chargements réels, aucune session SQL ni lecture R2',{timeout:60000},async()=>{
 const engine=process.env.RUNTIME_BROWSER_ENGINE??'chromium',type={chromium,firefox,webkit}[engine];assert.ok(type)
 const bundle=await build({entryPoints:['tests/fixtures/storage-diagnostic-host.tsx'],bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 const reads=[];let dbCalls=0,storageCalls=0
 const gateway=createArtifactGateway({publicBase:'chibaskogames-play.fr',previewBase:'chibaskogames-play.fr',contentBase:'chibaskogames-play.fr',portalOrigins:['https://portal.test']},{db:{async call(){dbCalls++;throw Error('SQL interdit dans ce diagnostic')}},storage:{async head(){storageCalls++;throw Error('R2 interdit')},async get(){storageCalls++;throw Error('R2 interdit')}}})
 const transport=await localHTTPSFixture(host=>['portal.test','diagnostics.chibaskogames-play.fr'].includes(host),async request=>{
  const url=new URL(request.url)
  if(url.hostname==='portal.test')return url.pathname==='/host.js'?new Response(bundle.outputFiles[0].contents,{headers:{'Content-Type':'text/javascript'}}):new Response('<!doctype html><html lang="fr"><div id="root"></div><script src="/host.js"></script></html>',{headers:{'Content-Type':'text/html'}})
  const response=await gateway(request)
  if(url.pathname==='/check')reads.push((await response.clone().json()).cookie)
  return response
 })
 let browser,context
 try{
  browser=await type.launch({headless:true,proxy:{server:transport.proxy},...(engine==='chromium'?{channel:'chrome'}:{})});context=await browser.newContext({ignoreHTTPSErrors:true,serviceWorkers:'block'})
  const page=await context.newPage();await page.goto('https://portal.test/')
  assert.equal(await page.locator('iframe').count(),0)
  await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Lancer le diagnostic'}).evaluate(node=>node===document.activeElement),true)
  await page.keyboard.press('Enter');await page.locator('dl').waitFor()
  assert.equal(reads.length,2);assert.equal(dbCalls,0);assert.equal(storageCalls,0)
  const cookie=page.locator('dl > div').filter({has:page.getByText('Cookie sécurisé transmis',{exact:true})})
  assert.match(await cookie.textContent(),reads.every(Boolean)?/Disponible/:/Indisponible/)
  assert.equal(await page.locator('dl > div').count(),4)
  assert.equal(await page.locator('iframe').count(),0)
  assert.equal((await context.cookies('https://diagnostics.chibaskogames-play.fr')).length,0,'Le cookie technique est supprimé après la vérification')
  await page.evaluate(()=>postMessage({channel:'chibasko.storage-check',nonce:'forged',phase:'read',hash:'a'.repeat(64),result:{cookie:true,retained:true,local:true,indexed:true}},location.origin))
  assert.match(await cookie.textContent(),reads.every(Boolean)?/Disponible/:/Indisponible/)
  console.log('Diagnostic',engine,browser.version(),JSON.stringify({cookie:reads.every(Boolean),sql:dbCalls,r2:storageCalls}))
 }finally{await context?.close();await browser?.close();await transport.close()}
})

import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
let browser,script
before(async()=>{
 script=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import {createRoot} from 'react-dom/client';import Notice from './components/GameCompatibilityNotice';import Detect from './components/DeviceCapabilities';const p=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(<><Detect/><h1>Fiche publique du jeu</h1><a href="/games/fixture">Partager la fiche</a><Notice value={p.get('value')} device={p.get('device')??'all'}><iframe title="Jeu" srcDoc="<p>Jeu lancé</p>"/></Notice></>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
for(const [value,device,allowed] of [['Oui','mobile',true],['Non','mobile',false],['platform:mobile','desktop',false],['platform:mobile','mobile',true],['platform:desktop','desktop',true],['platform:both','mobile',true],['','mobile',false]])test('fiche directe '+value+' sur '+device,async()=>{
 const context=await browser.newContext({viewport:{width:device==='mobile'?390:1366,height:844},isMobile:device==='mobile',hasTouch:device==='mobile'})
 try{
  await context.route('**/*',route=>route.request().url().endsWith('/fixture.js')?route.fulfill({contentType:'text/javascript',body:script}):route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script src="/fixture.js"></script>'}))
  const page=await context.newPage();await page.goto('https://portal.test/games/fixture?'+new URLSearchParams({value,device}))
  await page.getByRole('heading',{name:'Fiche publique du jeu'}).waitFor()
  assert.equal(await page.locator('iframe').count(),allowed?1:0)
  assert.equal(await page.getByRole('link',{name:'Partager la fiche'}).getAttribute('href'),'/games/fixture')
  if(!allowed){await page.getByRole('button',{name:'Continuer vers le lecteur'}).click();await page.getByTitle('Jeu',{exact:true}).waitFor()}
  await page.waitForFunction(()=>document.cookie.includes('cg-device='))
  const cookie=(await context.cookies()).find(item=>item.name==='cg-device');assert.equal(cookie.value,device);assert.equal(cookie.secure,true)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await context.close()}
})

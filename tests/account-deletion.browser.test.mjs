import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'

let browser,script
before(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import {createRoot} from 'react-dom/client';import AccountDeletion from './components/AccountDeletion';const root=createRoot(document.getElementById('root'));window.removeView=()=>root.unmount();root.render(<AccountDeletion accessToken="fixture-token" onAccountRemoved={async()=>{window.removed=(window.removed??0)+1}}/>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
 script=result.outputFiles[0].text;browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture(send){
 const context=await browser.newContext(),calls=[]
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><body><div id="root"></div><script src="/host.js"></script></body></html>'})
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script})
  assert.equal(url.pathname,'/api/account');assert.equal(route.request().method(),'DELETE')
  assert.equal(route.request().postData(),null);assert.equal(route.request().headers().authorization,'Bearer fixture-token')
  calls.push(route);await send(route,calls.length)
 })
 const page=await context.newPage();await page.goto('https://portal.test/');await page.getByRole('heading',{name:'Supprimer mon compte'}).waitFor()
 return {page,context,calls}
}

test('confirmation explicite et double clic : une seule demande, revue sans fausse réussite',async()=>{
 let finish
 const h=await fixture(route=>new Promise(resolve=>{finish=async()=>{await route.fulfill({status:202,json:{success:false,deletion:{id:'11111111-1111-4111-8111-111111111111',state:'review_required'}}});resolve()}}))
 try{
  const button=h.page.getByRole('button',{name:'Demander la suppression du compte'});assert.equal(await button.isDisabled(),true)
  await h.page.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('SUPPRIMER')
  await button.focus();await h.page.keyboard.press('Enter');await h.page.keyboard.press('Enter')
  await h.page.waitForFunction(()=>document.querySelector('button').disabled)
  assert.equal(h.calls.length,1);await finish();await h.page.getByRole('status').waitFor()
  assert.match(await h.page.getByRole('status').textContent(),/vérification administrative/)
  await h.page.getByText('Référence de suivi : 11111111-1111-4111-8111-111111111111').waitFor()
  assert.equal(await h.page.evaluate(()=>window.removed??0),0)
 }finally{await h.context.close()}
})
for(const state of ['prepared','cleanup_pending','completed'])test('état personnel '+state,async()=>{
 const h=await fixture(route=>route.fulfill({status:state==='completed'?200:202,json:{deletion:{state}}}))
 try{await h.page.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('SUPPRIMER');await h.page.getByRole('button').click();await h.page.getByRole('status').waitFor()
  assert.equal(await h.page.evaluate(()=>window.removed??0),state==='prepared'?0:1)
  if(state!=='prepared')assert.equal(await h.page.getByRole('button').count(),0)
 }finally{await h.context.close()}
})
test('délai expiré : résultat incertain, aucune répétition automatique puis reprise explicite',async()=>{
 let pending
 const h=await fixture((route,count)=>count===1?new Promise(resolve=>{pending=resolve}):route.fulfill({status:202,json:{deletion:{state:'review_required'}}}))
 try{
  await h.page.clock.install();await h.page.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('SUPPRIMER');await h.page.getByRole('button').click()
  await h.page.clock.runFor(31_000);await h.page.getByRole('alert').waitFor()
  assert.match(await h.page.getByRole('alert').textContent(),/incertain/);assert.equal(h.calls.length,1)
  await h.page.getByRole('button',{name:'Vérifier ou reprendre la demande'}).click();await h.page.getByRole('status').waitFor();assert.equal(h.calls.length,2)
 }finally{pending?.();await h.context.close()}
})
test('erreur serveur privée : message sûr et nouvelle tentative possible',async()=>{
 const h=await fixture(route=>route.fulfill({status:503,json:{error:'private database secret'}}))
 try{await h.page.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('SUPPRIMER');await h.page.getByRole('button').click();await h.page.getByRole('alert').waitFor()
  assert.doesNotMatch(await h.page.locator('body').textContent(),/private database secret/);assert.equal(await h.page.getByRole('button').isDisabled(),false)
 }finally{await h.context.close()}
})
test('une réponse après démontage ne déclenche pas de déconnexion',async()=>{
 let finish
 const h=await fixture(route=>new Promise(resolve=>{finish=async()=>{await route.fulfill({json:{deletion:{state:'completed'}}});resolve()}}))
 try{await h.page.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('SUPPRIMER');await h.page.getByRole('button').click()
  await h.page.evaluate(()=>window.removeView())
  const received=h.page.waitForResponse(response=>response.url()==='https://portal.test/api/account')
  await finish();await (await received).finished()
  assert.equal(await h.page.evaluate(()=>window.removed??0),0)
 }finally{await h.context.close()}
})

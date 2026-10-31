import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const id=n=>'fa910000-0000-4000-8000-'+String(n).padStart(12,'0')
let browser,script,css
before(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import {createRoot} from 'react-dom/client';import Measures from './components/admin/ModerationMeasures';import Appeals from './components/admin/ModerationAppeals';import Account from './components/AccountModeration';createRoot(document.getElementById('root')).render(location.pathname==='/account/moderation'?<Account/>:<main className="mx-auto max-w-4xl p-4"><h1>Modération</h1><Measures creationEnabled token="fixture" target="${id(2)}" kind={location.search.includes('game')?'game':'player'}/><Appeals token="fixture"/></main>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'services-simules',setup(b){
  b.onResolve({filter:/^(?:@\/components\/|\.\/)AuthProvider$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{auth:`export const useAuth=()=>({session:{access_token:'fixture'},loading:false})`,db:`export const supabase={auth:{async signOut(){window.loggedOut=true}}}`,link:`import {createElement} from 'react';export default p=>createElement('a',p)`}[path]}))
 }}]});script=result.outputFiles[0].text;css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css;browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture(width=390,path='/admin/moderation'){
 const context=await browser.newContext({viewport:{width,height:844}}),calls=[],state={reviewed:false,version:0,blocked:false,measure:null,history:[],name:'joueur-fixture'},record={id:id(3),action:'ban',reason:'Motif <script>window.injection=true</script> communiqué.',created_at:'2026-11-03T12:00:00Z',ends_at:null,appeal:null}
 await context.addInitScript(()=>{window.confirm=()=>true})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script});if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/api/admin/moderation/measures'){
   if(req.method()==='GET')return route.fulfill({json:{data:state}})
   const body=req.postDataJSON();calls.push(body);state.version++;state.measure=body.action;state.blocked=!['warn','lift','restore'].includes(body.action);state.history.unshift({...record,...body,id:body.operationId,created_at:record.created_at});return route.fulfill({json:{data:{id:body.operationId,version:state.version}}})
  }
  if(url.pathname==='/api/admin/moderation/appeals'){
   if(req.method()==='POST'){calls.push(req.postDataJSON());state.reviewed=true;return route.fulfill({json:{data:[]}})}
   return route.fulfill({json:{data:state.reviewed?[]:[{id:id(4),version:1,subject_version:state.version,user_id:id(2),username:'joueur-fixture',description:'Je souhaite faire verifier les faits.',action:'ban',reason:record.reason,created_at:record.created_at}]}})
  }
  if(url.pathname==='/api/account/moderation'){
   if(req.method()==='POST'){calls.push(req.postDataJSON());record.appeal={state:'pending',decision:null};return route.fulfill({json:{data:{state:'pending'}}})}
   return route.fulfill({json:{data:{blocked:true,measure:'ban',current:record,history:[record]}}})
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-black text-white"><div id="root"></div><script src="/host.js"></script></body></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test'+path);return {context,page,calls,state}
}
for(const width of [390,768,1366])test('mesure administrative responsive à '+width+'px : justification et confirmation',async()=>{
 const x=await fixture(width);try{
  await x.page.getByLabel('Mesure',{exact:true}).selectOption('suspend');await x.page.getByLabel('Durée',{exact:true}).selectOption('168');await x.page.getByLabel('Motif communiqué à la personne concernée').fill('Suspension de fixture justifiee par des faits verifies.');await x.page.getByLabel('Note privée sur la mesure').fill('Note interne uniquement.')
  await x.page.getByRole('button',{name:'Confirmer la mesure'}).dblclick();await x.page.getByText('Note privée : Note interne uniquement.').waitFor();assert.equal(x.calls.length,1);assert.equal(x.calls[0].action,'suspend');assert.ok(x.calls[0].endsAt);assert.ok(x.calls[0].operationId)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await x.context.close()}
})
test('dépublication et restauration réutilisent le même formulaire et la version courante',async()=>{
 const x=await fixture(1366,'/admin/moderation?game');try{
  await x.page.getByLabel('Motif communiqué à la personne concernée').fill('Retrait temporaire le temps de verifier les contenus.');await x.page.getByRole('button',{name:'Confirmer la mesure'}).click();await x.page.getByText(/Restriction active/).waitFor()
  await x.page.getByLabel('Mesure',{exact:true}).selectOption('restore');await x.page.getByLabel('Motif communiqué à la personne concernée').fill('Verification terminee, la publication est restauree.');await x.page.getByRole('button',{name:'Confirmer la mesure'}).click();await x.page.getByText('Aucune restriction active.').waitFor();assert.deepEqual(x.calls.map(call=>call.action),['unpublish','restore']);assert.equal(x.calls[1].version,1)
 }finally{await x.context.close()}
})
test('compte restreint : motif, recours et déconnexion accessibles sans note privée',async()=>{
 const x=await fixture(390,'/account/moderation');try{
  await x.page.getByRole('heading',{name:'Motif de la restriction active'}).waitFor();assert.equal(await x.page.evaluate(()=>window.injection),undefined)
  await x.page.getByRole('button',{name:'Contester la restriction active'}).click();await x.page.getByLabel('Motif de ton recours').fill('Je demande un reexamen des faits presentes dans la decision.');await x.page.getByRole('button',{name:'Envoyer le recours'}).dblclick();await x.page.getByText('Recours en cours d’examen.').waitFor();assert.equal(x.calls.length,1)
  await x.page.getByRole('button',{name:'Se déconnecter'}).click();assert.equal(await x.page.evaluate(()=>window.loggedOut),true);assert.equal(await x.page.getByLabel('Note privée sur la mesure').count(),0)
 }finally{await x.context.close()}
})
test('recours administratif : une acceptation ne lève la sanction que sur choix explicite',async()=>{
 const x=await fixture();try{
  await x.page.getByRole('button',{name:'Examiner les recours'}).click();await x.page.getByRole('button',{name:'Réexaminer le recours'}).click();await x.page.getByLabel('Issue du recours').selectOption('accepted');await x.page.getByLabel('Justification du réexamen').fill('Les elements nouveaux justifient une levee explicite.');await x.page.getByLabel('Lever explicitement la restriction actuellement active').check();await x.page.getByRole('button',{name:'Confirmer le réexamen'}).click();await x.page.getByText('Aucun recours en attente.').waitFor();assert.equal(x.calls[0].lift,true);assert.equal(x.calls[0].state,'accepted')
 }finally{await x.context.close()}
})

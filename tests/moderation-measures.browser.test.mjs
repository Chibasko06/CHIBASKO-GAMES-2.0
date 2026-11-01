import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const id=n=>'fa910000-0000-4000-8000-'+String(n).padStart(12,'0')
let browser,script,css
before(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import {createRoot} from 'react-dom/client';import Moderation from './components/admin/Moderation';import Account from './components/AccountModeration';const q=new URLSearchParams(location.search);createRoot(document.getElementById('root')).render(location.pathname==='/account/moderation'?<Account/>:<Moderation measuresEnabled view={q.get('view')??'reports'} measureId={q.get('measure')??undefined} appealId={q.get('appeal')??undefined} directTarget={q.has('target')?{id:q.get('target'),kind:q.get('kind')??'player'}:undefined}/>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'services-simules',setup(b){
  b.onResolve({filter:/^(?:@\/components\/|\.\/)AuthProvider$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^@\/components\/admin\/useAdminAccess$/},()=>({path:'access',namespace:'fixture'}));b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{navigation:`export const useRouter=()=>({push(){}})`,access:`export const useAdminAccess=()=>({status:'allowed',retry(){}})`,auth:`import {useSyncExternalStore} from 'react';const subscribe=cb=>{window.addEventListener('fixture-auth',cb);return()=>window.removeEventListener('fixture-auth',cb)};export function useAuth(){const token=useSyncExternalStore(subscribe,()=>window.fixtureToken??'fixture',()=> 'fixture');return {session:location.search.includes('guest')?null:{access_token:token,user:{id:token}},loading:false}}`,db:`export const supabase={auth:{async signOut(){window.loggedOut=true}}}`,link:`import {createElement} from 'react';export default p=>createElement('a',p)`}[path]}))
 }}]});script=result.outputFiles[0].text;css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css;browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture(width=390,path='/admin/moderation?target='+id(2)+'&kind=player'){
 let releaseSecond;const secondResponse=new Promise(resolve=>{releaseSecond=resolve})
 const context=await browser.newContext({viewport:{width,height:844}}),calls=[],state={reviewed:false,version:0,blocked:false,measure:null,history:[],name:'joueur-fixture'},record={id:id(3),action:'ban',reason:'Motif <script>window.injection=true</script> communiqué.',created_at:'2026-11-03T12:00:00Z',ends_at:null,appeal:null}
 if(path.includes('warning-appeal'))record.action='warn'
 state.facts=path.includes('closed-facts')?[{id:id(7),reference:'incident-deja-examine',summary:'Faits contestés ayant déjà donné lieu à un recours accepté.',revision:1,state:'closed',decided:true,created_at:record.created_at}]:[]
 await context.addInitScript(()=>{window.confirm=()=>true})
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script});if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/api/admin/moderation/facts'){
   if(req.method()==='POST'){calls.push(req.postDataJSON());state.facts[0]={...state.facts[0],revision:2,state:'open',decided:false}}
   return route.fulfill({json:{data:{items:state.facts,hasMore:false}}})
  }
  if(url.pathname==='/api/admin/moderation/measures'){
   if(req.method()==='GET')return route.fulfill({json:{data:state}})
   const body=req.postDataJSON();calls.push(body);state.version++;state.measure=body.action;state.blocked=!['warn','lift','restore'].includes(body.action);state.history.unshift({...record,...body,id:body.operationId,created_at:record.created_at});return route.fulfill({json:{data:{id:body.operationId,version:state.version}}})
  }
  if(url.pathname==='/api/admin/moderation/appeals'){
   if(req.method()==='POST'){calls.push(req.postDataJSON());state.effect=req.postDataJSON().effect;state.reviewed=true;return route.fulfill({json:{data:[]}})}
   return route.fulfill({json:{data:state.reviewed?[]:[{id:id(4),version:1,subject_version:state.version,user_id:id(2),username:'joueur-fixture',description:'Je souhaite faire verifier les faits.',action:'ban',reason:record.reason,created_at:record.created_at}]}})
  }
  if(url.pathname==='/api/admin/moderation/history'){
   const measure={...record,subject:id(2),kind:'player',target:id(2),name:'joueur-fixture',actor_name:'admin-fixture',actor_reference:id(1),version:1,current_version:1,blocked:true,protected:false,state:'active',next:null,note:'Note privée de fixture',appeal:{id:id(4),state:'pending'},mail:[]}
   const appeal={id:id(4),version:1,state:state.reviewed?'accepted':'pending',effect:state.effect,username:'joueur-fixture',description:'Je souhaite faire verifier les faits.',decision:state.reviewed?'Les faits ont été réexaminés.':null,created_at:record.created_at,reviewed_at:state.reviewed?record.created_at:null,measure}
   if(url.searchParams.get('view')==='deliveries')return route.fulfill({json:{data:{items:[{id:id(9),kind:'decision',state:'sent',attempts:1,created_at:record.created_at,recipient_name:'joueur-fixture'}],hasMore:false}}})
   return route.fulfill({json:{data:url.searchParams.has('id')?(url.searchParams.get('view')==='appeals'?appeal:measure):{items:url.searchParams.get('view')==='appeals'?[appeal]:[measure],hasMore:false}}})
  }
  if(url.pathname==='/api/admin/moderation')return route.fulfill({json:{data:{items:[],hasMore:false}}})
  if(url.pathname==='/api/account/moderation'){
   if(req.headers().authorization==='Bearer second'){await secondResponse;return route.fulfill({json:{data:{blocked:false,history:[]}}})}
   if(req.method()==='POST'){calls.push(req.postDataJSON());record.appeal={state:'pending',decision:null};return route.fulfill({json:{data:{state:'pending'}}})}
   const clean=new URL(req.url()).searchParams.has('clean')||path.includes('clean')
   if(path.includes('old-warning')){record.action='warn';record.created_at='2021-01-01T00:00:00Z'}
   return route.fulfill({json:{data:{blocked:!clean,measure:clean?null:'ban',current:clean||record.action==='warn'?null:record,history:clean?[]:[record]}}})
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-black text-white"><div id="root"></div><script src="/host.js"></script></body></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test'+path);return {context,page,calls,state,releaseSecond}
}
for(const width of [390,768,1366])test('mesure administrative responsive à '+width+'px : justification et confirmation',async()=>{
 const x=await fixture(width);try{
  await x.page.getByRole('button',{name:'Prendre une mesure — faits nouveaux ou réexamen',exact:true}).click();await x.page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Mesure');await x.page.getByLabel('Mesure',{exact:true}).selectOption('suspend');await x.page.getByLabel('Durée',{exact:true}).selectOption('168');await x.page.getByLabel('Motif communiqué à la personne concernée').fill('Suspension de fixture justifiee par des faits verifies.');await x.page.getByLabel('Note privée sur la mesure').fill('Note interne uniquement.')
  await x.page.getByLabel('Référence stable des faits').fill('incident-2026-a');await x.page.getByLabel('Description des faits nouveaux').fill('Incident distinct vérifié pendant la qualification du formulaire.');await x.page.getByRole('button',{name:'Confirmer la mesure'}).dblclick();await x.page.getByRole('link',{name:'Consulter l’historique de la mesure'}).waitFor();assert.equal(x.calls.length,1);assert.equal(x.calls[0].action,'suspend');assert.ok(x.calls[0].endsAt);assert.ok(x.calls[0].operationId);assert.equal(x.calls[0].factsKey,'incident-2026-a')
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await x.context.close()}
})
test('dépublication et restauration réutilisent le même formulaire et la version courante',async()=>{
 const x=await fixture(1366,'/admin/moderation?target='+id(2)+'&kind=game');try{
  await x.page.getByRole('button',{name:'Prendre une mesure — faits nouveaux ou réexamen',exact:true}).click();await x.page.getByLabel('Motif communiqué à la personne concernée').fill('Retrait temporaire le temps de verifier les contenus.');await x.page.getByLabel('Référence stable des faits').fill('incident-jeu-1');await x.page.getByLabel('Description des faits nouveaux').fill('Contenu nouveau vérifié et justifiant le retrait temporaire.');await x.page.getByRole('button',{name:'Confirmer la mesure'}).click();await x.page.getByText(/Restriction active/).waitFor()
  await x.page.getByRole('button',{name:'Prendre une mesure — faits nouveaux ou réexamen',exact:true}).click();await x.page.getByLabel('Mesure',{exact:true}).selectOption('restore');await x.page.getByLabel('Motif communiqué à la personne concernée').fill('Verification terminee, la publication est restauree.');await x.page.getByRole('button',{name:'Confirmer la mesure'}).click();await x.page.getByText('Aucune restriction active.').waitFor();assert.deepEqual(x.calls.map(call=>call.action),['unpublish','restore']);assert.equal(x.calls[1].version,1)
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
 const x=await fixture(390,'/admin/moderation?view=appeals&appeal='+id(4));try{
  await x.page.getByLabel('Issue du recours').selectOption('accepted');await x.page.getByLabel('Justification du réexamen').fill('Les elements nouveaux justifient une levee explicite.');await x.page.getByLabel('Lever explicitement la restriction actuellement active').check();await x.page.getByRole('button',{name:'Confirmer le réexamen'}).click();await x.page.getByRole('heading',{name:'Décision communiquée'}).waitFor();assert.equal(x.calls[0].lift,true);assert.equal(x.calls[0].state,'accepted')
 }finally{await x.context.close()}
})

for(const width of [390,1366])test('centre séparé : navigation, historique et notifications à '+width+'px',async()=>{
 const x=await fixture(width,'/admin/moderation?view=measures');try{
  await x.page.getByRole('heading',{name:'Sanctions et avertissements',exact:true}).waitFor()
  assert.equal(await x.page.getByLabel('Motif communiqué à la personne concernée').count(),0)
  assert.equal(await x.page.getByRole('navigation',{name:'Espaces de modération'}).getByRole('link').count(),3)
  await x.page.getByLabel('Rechercher une cible').fill('joueur');await x.page.getByRole('button',{name:'Rechercher',exact:true}).click()
  await x.page.getByRole('link',{name:'Ouvrir la mesure',exact:true}).click()
  await x.page.getByRole('heading',{name:'Notifications de cette mesure'}).waitFor()
  await x.page.getByText('Accepté par Resend · 1 tentative(s)',{exact:true}).waitFor()
  assert.match(await x.page.locator('[data-admin-console]').textContent(),/pas que le message a été reçu/)
  assert.equal(await x.page.evaluate(()=>window.injection),undefined)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await x.page.screenshot({path:join(tmpdir(),'chibasko-moderation-centre-'+width+'.png'),fullPage:true})
  await x.page.getByRole('navigation',{name:'Espaces de modération'}).getByRole('link',{name:'Recours',exact:true}).click()
  await x.page.getByRole('link',{name:'Ouvrir le recours',exact:true}).waitFor()
  assert.equal(await x.page.getByLabel('Motif communiqué à la personne concernée').count(),0)
 }finally{await x.context.close()}
})

test('espace personnel : absence de sanction et avertissement ancien',async()=>{
 for(const variant of ['clean','old-warning']){
  const x=await fixture(390,'/account/moderation?'+variant);try{
   await x.page.getByRole('heading',{name:'Mes avertissements et sanctions'}).waitFor()
   if(variant==='clean')await x.page.getByText('Aucune décision enregistrée.').waitFor()
   else{await x.page.getByRole('heading',{name:/Avertissement.*2021/}).waitFor();await x.page.getByRole('button',{name:'Contester cette décision'}).waitFor()}
   assert.doesNotMatch(await x.page.locator('main').textContent(),/Note privée de fixture/)
  }finally{await x.context.close()}
 }
})

test('invité : le lien de connexion conserve la destination de la décision',async()=>{
 const x=await fixture(390,'/account/moderation?guest');try{
  assert.equal(await x.page.getByRole('link',{name:'Se connecter',exact:true}).getAttribute('href'),'/login?next=%2Faccount%2Fmoderation')
 }finally{await x.context.close()}
})

test('changement de compte : aucun ancien motif ni brouillon pendant le chargement',async()=>{
 const x=await fixture(390,'/account/moderation');try{
  await x.page.getByRole('button',{name:'Contester cette décision'}).click();await x.page.getByLabel('Motif de ton recours').fill('Brouillon prive du premier compte a masquer.')
  const requested=x.page.waitForRequest(request=>request.url().includes('/api/account/moderation')&&request.headers().authorization==='Bearer second')
  await x.page.evaluate(()=>{window.fixtureToken='second';window.dispatchEvent(new Event('fixture-auth'))});await requested
  assert.equal(await x.page.getByLabel('Motif de ton recours').count(),0);assert.doesNotMatch(await x.page.locator('main').textContent(),/Motif <script>|Brouillon prive/)
  x.releaseSecond();await x.page.getByText('Aucune décision enregistrée.').waitFor()
 }finally{x.releaseSecond();await x.context.close()}
})

test('avertissement contesté : acceptation et retrait sont explicitement distincts',async()=>{
 const x=await fixture(390,'/admin/moderation?view=appeals&appeal='+id(4)+'&warning-appeal');try{
  await x.page.getByLabel('Issue du recours').selectOption('accepted')
  await x.page.getByLabel('Justification du réexamen').fill('Les faits ne justifient pas cet avertissement ; retrait décidé.')
  await x.page.getByLabel('Retirer explicitement l’avertissement contesté, sans lever d’autre restriction').check()
  assert.equal(await x.page.getByLabel('Lever explicitement la restriction actuellement active').count(),0)
  await x.page.getByRole('button',{name:'Confirmer le réexamen'}).click()
  await x.page.getByText('Avertissement retiré. Les autres restrictions restent inchangées.').waitFor()
  assert.equal(x.calls[0].effect,'withdraw_warning');assert.equal(x.calls[0].lift,false)
 }finally{await x.context.close()}
})
test('mêmes faits clos : confirmation interdite avant réouverture motivée',async()=>{
 const x=await fixture(1366,'/admin/moderation?target='+id(2)+'&kind=player&closed-facts');try{
  await x.page.getByRole('button',{name:'Prendre une mesure — faits nouveaux ou réexamen',exact:true}).click()
  await x.page.getByLabel('Affaire',{exact:true}).selectOption(id(7))
  await x.page.getByText('Nouvelle mesure bloquée sur cette révision.',{exact:false}).waitFor()
  assert.equal(await x.page.getByRole('button',{name:'Confirmer la mesure'}).isDisabled(),true)
  await x.page.getByLabel('Justification de réouverture').fill('Nouvel élément vérifié justifiant le réexamen du dossier.')
  await x.page.getByRole('button',{name:'Réouvrir explicitement les faits'}).click()
  await x.page.getByLabel('Motif communiqué à la personne concernée').fill('Motif du réexamen explicitement justifié et vérifié.')
  await x.page.getByRole('button',{name:'Confirmer la mesure'}).click()
  await x.page.getByRole('link',{name:'Consulter l’historique de la mesure'}).waitFor()
  assert.equal(x.calls[1].factId,id(7));assert.equal(x.calls[1].factsRevision,2)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await x.context.close()}
})

test('pagination des affaires : une ancienne sélection ne devient pas implicitement des faits nouveaux',async()=>{
 const x=await fixture(390);try{
  await x.context.route('**/api/admin/moderation/facts?*',route=>{const older=new URL(route.request().url()).searchParams.has('before');return route.fulfill({json:{data:{items:[{id:id(older?8:7),reference:older?'affaire-ancienne':'affaire-recente',summary:'Faits disponibles pour un examen administratif explicite.',revision:1,state:'open',decided:false,created_at:'2026-11-03T12:00:00Z'}],hasMore:!older}}})})
  await x.page.getByRole('button',{name:'Prendre une mesure — faits nouveaux ou réexamen',exact:true}).click()
  await x.page.getByLabel('Référence stable des faits').fill('brouillon-faits-distincts')
  await x.page.getByLabel('Description des faits nouveaux').fill('Description saisie avant de sélectionner une affaire existante.')
  await x.page.getByLabel('Affaire',{exact:true}).selectOption(id(7))
  await x.page.getByRole('button',{name:'Affaires antérieures',exact:true}).click()
  await x.page.getByText('L’affaire sélectionnée n’est pas sur cette page.',{exact:false}).waitFor()
  assert.equal(await x.page.getByRole('button',{name:'Confirmer la mesure'}).isDisabled(),true)
  assert.equal(x.calls.length,0)
 }finally{await x.context.close()}
})

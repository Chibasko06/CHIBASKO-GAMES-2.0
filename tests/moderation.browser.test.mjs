import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const id=n=>'fa700000-0000-4000-8000-'+String(n).padStart(12,'0')
let browser,script,css
before(async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import {createRoot} from 'react-dom/client';import Report from './components/ReportForm';import Menu from './components/GameSharingMenu';import ProfileActions from './components/ProfileSocialActions';import Moderation from './components/admin/Moderation';createRoot(document.getElementById('root')).render(location.search.includes('menu=game')?<Menu gameId="${id(2)}" title="Jeu" url="https://chibaskogames.fr/games/jeu"/>:location.search.includes('menu=profile')?<ProfileActions target="${id(2)}" username="joueur-bloque"/>:location.pathname.startsWith('/admin')?<Moderation/>:<main className="mx-auto max-w-2xl p-4"><h1>Signaler un joueur</h1><Report kind="player" target="${id(2)}" siteKey="fixture-site-key"/></main>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'services-de-test',setup(b){
  b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  b.onResolve({filter:/^@\/components\/admin\/useAdminAccess$/},()=>({path:'access',namespace:'fixture'}))
  b.onResolve({filter:/^next\/(?:link|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{auth:`export const useAuth=()=>({loading:false,user:window.fixture.guest?null:{id:'${id(1)}'},session:window.fixture.guest?null:{access_token:'fixture'}})`,access:`export const useAdminAccess=()=>({status:'allowed',retry(){}})`,link:`import {createElement} from 'react';export default p=>createElement('a',p)`,navigation:`export const useRouter=()=>({push(){}})`}[path]}))
 }}]});script=bundle.outputFiles[0].text;css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture({guest=false,admin=false,width=390,menu='',linked=false}={}){
 const context=await browser.newContext({viewport:{width,height:844}}),calls=[],record={id:id(3),number:42,target_kind:'player',target_user:id(2),target_game:null,target_locator:'/players/'+id(2),reporter:guest?null:id(1),category:'spam',description:'Description <script>window.injection=true</script> du signalement.',contact_name:null,contact_email:null,state:'open',version:1,created_at:'2026-10-29T12:00:00Z',privacy_review:false,reporter_name:'declarant',target_view:{username:'joueur-signale',bio:'Profil public'},events:[],mail:[{id:id(9),kind:'admin',state:'pending',attempts:1}]}
 await context.addInitScript(({guest})=>{window.fixture={guest};window.confirm=()=>true},{guest})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.hostname==='challenges.cloudflare.com')return route.fulfill({contentType:'text/javascript',body:`window.turnstile={render(element,options){element.textContent='Vérification anti-robot de test';options.callback('fixture-bot-token');return 'fixture'},remove(){},reset(){}}`})
  assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/api/social')return route.fulfill({json:{state:'unavailable',relationId:null}})
  if(url.pathname==='/api/reports'){calls.push(request.postDataJSON());return route.fulfill({status:201,json:{data:{id:id(3),number:42}}})}
  if(url.pathname==='/api/admin/moderation'){
   const body=request.method()==='POST'?request.postDataJSON():null;calls.push(body??Object.fromEntries(url.searchParams))
   if(body){if(body.version!==record.version)return route.fulfill({status:409,json:{error:'Dossier modifié. Recharge le dossier.'}});record.version++;record.state=body.state;record.events.push({id:id(5),actor:id(1),state:body.state,created_at:'2026-10-29T13:00:00Z',note:body.note,justification:body.justification});return route.fulfill({json:{data:record}})}
   return route.fulfill({json:{data:url.searchParams.has('id')?record:{items:[record],hasMore:false,page:1}}})
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-black text-white"><div id="root"></div><script src="/host.js"></script></body></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test/'+(admin?'admin/moderation'+(linked?'?id='+id(3):''):'contact?report=player'+(menu?'&menu='+menu:'')))
 return {context,page,calls,record}
}
for(const guest of [false,true])test('signalement '+(guest?'invité avec défi':'authentifié')+' : formulaire accessible et réception',async()=>{
 const x=await fixture({guest});try{
  await x.page.getByLabel('Motif',{exact:true}).selectOption('spam');await x.page.getByLabel('Description et emplacement précis').fill('Le joueur envoie des messages de spam repetes dans le service.')
  if(guest){await x.page.getByLabel('Nom ou dénomination').fill('Invité de test');await x.page.getByLabel('E-mail de contact').fill('guest@example.test')}
  await x.page.getByRole('button',{name:'Envoyer le signalement'}).click();await x.page.getByText('Signalement reçu — dossier #42').waitFor()
  assert.equal(x.calls.length,1);assert.equal(x.calls[0].target,id(2));assert.equal(guest?x.calls[0].botToken==='fixture-bot-token':x.calls[0].contactEmail==='',true)
  assert.ok(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 }finally{await x.context.close()}
})
test('notification illicite : bonne foi explicite et exception sans coordonnées',async()=>{
 const x=await fixture({guest:true});try{
  await x.page.getByLabel('Motif',{exact:true}).selectOption('illegal');await x.page.getByLabel('Description et emplacement précis').fill('Description precise du contenu signale et de son emplacement.')
  await x.page.getByLabel(/Je crois de bonne foi/).check();await x.page.getByLabel(/Signalement relatif à des abus/).check()
  assert.equal(await x.page.getByLabel('E-mail de contact').count(),0)
  await x.page.getByRole('button',{name:'Envoyer le signalement'}).click();await x.page.getByText('Signalement reçu — dossier #42').waitFor();assert.equal(x.calls[0].sensitiveException,true);assert.equal(x.calls[0].contactEmail,'')
 }finally{await x.context.close()}
})
for(const width of [390,768,1366])test('modération administrative à '+width+'px : recherche, détail, historique et aucune sanction',async()=>{
 const x=await fixture({admin:true,width});try{
  await x.page.getByRole('heading',{name:'@joueur-signale'}).waitFor();assert.equal(await x.page.getByText('Spam',{exact:true}).count(),1)
  await x.page.getByRole('button',{name:'Examiner le dossier #42'}).click();await x.page.getByRole('heading',{name:'Dossier #42'}).waitFor()
  assert.equal(await x.page.getByText(id(3),{exact:true}).isVisible(),false);await x.page.getByText('Références techniques',{exact:true}).click();assert.equal(await x.page.getByText(id(3),{exact:true}).isVisible(),true)
  await x.page.getByLabel('Note administrative privée').fill('Brouillon à conserver');x.record.mail[0].state='sent';await x.page.getByRole('button',{name:'Actualiser les envois'}).click();await x.page.getByText(/Accepté par le service d’envoi/).waitFor();assert.equal(await x.page.getByLabel('Note administrative privée').inputValue(),'Brouillon à conserver')
  assert.equal(await x.page.evaluate(()=>window.injection),undefined)
  await x.page.getByLabel('Décision de suivi').selectOption('resolved');await x.page.getByLabel('Justification communicable').fill('Examen termine et dossier resolu sans application de sanction.');await x.page.getByLabel('Note administrative privée').fill('Note interne de fixture.')
  await x.page.getByRole('button',{name:'Enregistrer la décision'}).click();await x.page.getByText('Note privée : Note interne de fixture.').waitFor();assert.equal(x.record.state,'resolved')
  assert.ok(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await x.page.getByRole('button',{name:/Bannir|Suspendre/}).count(),0)
 }finally{await x.context.close()}
})

for(const menu of ['profile','game'])test('menu réel '+menu+' : signalement accessible après fermeture du menu',async()=>{
 const x=await fixture({menu});try{
  await x.page.getByLabel(menu==='game'?'Partager ce jeu':'Actions pour @joueur-bloque').click()
  await x.page.getByRole('button',{name:menu==='game'?'Signaler le jeu':'Signaler le joueur',exact:true}).click()
  const dialog=x.page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('Description et emplacement précis').fill('Description du signalement depuis le menu reel du site.')
  await dialog.getByRole('button',{name:'Envoyer le signalement'}).click();await dialog.getByText('Signalement reçu — dossier #42').waitFor()
  assert.equal(x.calls[0].kind,menu==='game'?'game':'player')
  await x.page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'})
 }finally{await x.context.close()}
})


test('lien depuis un e-mail : le dossier s’ouvre directement sans charger la liste',async()=>{
 const x=await fixture({admin:true,linked:true});try{
  await x.page.getByRole('heading',{name:'Dossier #42'}).waitFor();assert.deepEqual(x.calls,[{id:id(3)}]);assert.equal(await x.page.getByText('Alerte administrative',{exact:true}).count(),1)
 }finally{await x.context.close()}
})

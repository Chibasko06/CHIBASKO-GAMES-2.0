import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

let script,css,browser
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
before(async()=>{
 const bundled=await build({entryPoints:['tests/fixtures/admin-console-host.tsx'],write:false,bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'services-isoles',setup(b){
  b.onResolve({filter:/^next\/(link|image|navigation|dynamic)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
  b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  b.onResolve({filter:/supabaseClient$/},()=>({path:'db',namespace:'fixture'}))
  b.onResolve({filter:/game-runtime\/GameRuntime$/},()=>({path:'runtime',namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{
   auth:`const user={id:'${id(1)}'};const session={user,access_token:'fixture-token'};const value={user,session,loading:false};export function useAuth(){return value}`,
   db:`export const supabase={auth:{async getSession(){return {data:{session:{user:{id:'${id(1)}'},access_token:'fixture-token'}},error:null}}}}`,
   navigation:`import {useSyncExternalStore} from 'react';const subscribe=cb=>{window.addEventListener('popstate',cb);return()=>window.removeEventListener('popstate',cb)};export function useSearchParams(){return new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search))}const router={push(path){history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'))},replace(path){history.replaceState({},'',path);dispatchEvent(new PopStateEvent('popstate'))}};export function useRouter(){return router}`,
   link:`import {createElement} from 'react';export default function Link(props){return createElement('a',{...props,onClick:event=>{if(props.href.startsWith('/')){event.preventDefault();history.pushState({},'',props.href);dispatchEvent(new PopStateEvent('popstate'))}}})}`,
   image:`import {createElement} from 'react';export default function Image({unoptimized,fill,priority,...props}){return createElement('img',props)}`,
   dynamic:`export default function dynamic(){return ()=>null}`,runtime:`export default function Runtime(){return null}`,
  }[path]}))
 }}]})
 script=bundled.outputFiles[0].contents
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())

async function fixture({viewport={width:1366,height:768},path='/admin',conflict=false,denied=false}={}){
 const context=await browser.newContext({viewport}),requests=[],users=Array.from({length:103},(_,i)=>({id:id(i+1),username:'Membre '+String(i).padStart(3,'0'),bio:'Création et découverte de jeux.',avatar_url:null,created_at:'2026-01-01T10:00:00Z',email:'private-'+i+'@example.test',roles:{admin:i%4===0||i%4===2,developer:i%4===0||i%4===1}}))
 const games=Array.from({length:53},(_,i)=>({id:id(i+201),title:'Jeu '+String(i).padStart(3,'0'),slug:'jeu-'+i,game_url:'https://games.example.test/'+i,thumbnail_url:'/thumbnail.svg',description:'Description du jeu.',developer_name:'Studio',technology:'HTML5',game_type:i%3?'classic':'multiplayer_chibasko',is_published:i%2===0,is_beta:false,created_at:'2026-01-01',game_categories:[]}))
 const categories=[{id:id(800),name:'Arcade',slug:'arcade',games_count:5}],faqEntries=[{id:id(801),question:'Comment jouer ?',answer:'Choisissez un jeu.',sort_order:0,is_published:true}]
 let jobs=[{id:id(500),state:'review_required',reason:null,attentionRequired:false},{id:id(501),state:'prepared',reason:null,attentionRequired:true}]
 const build={id:id(700),game:'Jeu en revue',version:'1.0.0',developer:'Studio',technicalStatus:'queued',createdAt:'2026-01-01',archiveSize:102400,review:{checklist:{},decision:'pending'},history:[]}
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,'https://portal.test','Aucun service réel dans les tests')
  if(url.pathname==='/app.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(script)})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/thumbnail.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><rect width="64" height="36" fill="#164e63"/></svg>'})
  if(url.pathname.startsWith('/api/')){
   requests.push({path:url.pathname,search:Object.fromEntries(url.searchParams),method:request.method(),body:request.postDataJSON()})
   assert.equal(request.headers().authorization,'Bearer fixture-token')
   if(url.pathname==='/api/admin/status')return route.fulfill({status:denied?403:200,json:{isAdmin:!denied}})
   if(denied)throw Error('Lecture privée après refus')
   if(url.pathname==='/api/admin/overview')return route.fulfill({json:{overview:{games:53,publishedGames:27,users:103,buildsAwaitingReview:1,buildsAwaitingValidation:1,deletionsAwaitingReview:1,deletionsBlocked:1,notificationsBlocked:0}}})
   const page=Number(url.searchParams.get('page')??1),search=url.searchParams.get('search')??''
   if(url.pathname==='/api/admin/users'){
    const role=url.searchParams.get('role')??'all',rows=users.filter(user=>user.username.toLowerCase().includes(search.toLowerCase())&&(role==='all'||user.roles[role]))
    return route.fulfill({json:{users:rows.slice((page-1)*50,page*50),total:rows.length}})
   }
   if(url.pathname.startsWith('/api/admin/users/')){
    const user=users.find(user=>user.id===url.pathname.split('/')[4])
    if(request.method()==='DELETE')return route.fulfill({status:202,json:{success:false,deletion:{id:id(500),state:'review_required'}}})
    if(conflict)return route.fulfill({status:409,json:{error:'Le profil a changé. Rechargez-le avant de recommencer.'}})
    const data=request.postDataJSON();Object.assign(user,{username:data.username,bio:data.bio,avatar_url:data.avatar_url||null});return route.fulfill({json:{user}})
   }
   if(url.pathname==='/api/admin/games'){
    let rows=games.filter(game=>game.title.toLowerCase().includes(search.toLowerCase()))
    if(url.searchParams.get('status')==='published')rows=rows.filter(game=>game.is_published)
    if(url.searchParams.get('status')==='hidden')rows=rows.filter(game=>!game.is_published)
    if(['classic','multiplayer_chibasko'].includes(url.searchParams.get('type')))rows=rows.filter(game=>game.game_type===url.searchParams.get('type'))
    return route.fulfill({json:{games:rows.slice((page-1)*50,page*50),total:rows.length}})
   }
   for(const [entity,rows,key] of [['categories',categories,'categories'],['faq',faqEntries,'faqEntries']]){
    if(url.pathname==='/api/admin/'+entity){
     if(request.method()==='POST')rows.push({id:id(entity==='faq'?803:802),...request.postDataJSON()})
     return route.fulfill({json:{[key]:rows}})
    }
    if(url.pathname.startsWith('/api/admin/'+entity+'/')){
     const index=rows.findIndex(row=>row.id===url.pathname.split('/')[4])
     if(request.method()==='DELETE')rows.splice(index,1);else Object.assign(rows[index],request.postDataJSON())
     return route.fulfill({json:{success:true}})
    }
   }
   if(url.pathname==='/api/admin/game-builds')return route.fulfill({json:{data:[build]}})
   if(url.pathname.startsWith('/api/admin/game-builds/'))return route.fulfill({json:{data:build}})
   if(url.pathname==='/api/admin/game-submissions')return route.fulfill({json:{submissions:[]}})
   if(url.pathname==='/api/admin/account-deletions'){
    const state=url.searchParams.get('state')??'all',rows=jobs.filter(job=>state==='all'||job.state===state||(state==='attention'&&job.attentionRequired))
    return route.fulfill({json:{deletions:rows,total:rows.length}})
   }
   if(url.pathname.startsWith('/api/admin/account-deletions/')){
    const job=jobs.find(job=>job.id===url.pathname.split('/')[4]);job.state='prepared';return route.fulfill({status:202,json:{success:false,deletion:job}})
   }
   throw Error('Route de fixture non prévue : '+url.pathname)
  }
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test'+path)
 return {page,context,requests}
}

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1366,height:768},{width:1920,height:1080}])test('rubriques sans débordement '+viewport.width+'×'+viewport.height,async()=>{
 const x=await fixture({viewport});try{
  for(const [path,title] of [['/admin','Vue d’ensemble'],['/admin?section=users','Utilisateurs'],['/admin?section=games','Jeux'],['/admin?section=categories','Catégories'],['/admin?section=faq','FAQ'],['/admin/game-builds','Soumissions'],['/admin/account-deletions','Suppressions de comptes']]){
   await x.page.goto('https://portal.test'+path);await x.page.getByRole('heading',{name:title,exact:true,level:1}).waitFor()
   if(path.includes('users'))await x.page.getByRole('button',{name:'Modifier Membre 000',exact:true}).waitFor()
   if(path.includes('games&')||path.endsWith('section=games'))await x.page.getByRole('button',{name:'Modifier Jeu 000',exact:true}).waitFor()
   assert.equal(await x.page.locator('h1').count(),1)
   assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,path)
   if((viewport.width===390||viewport.width===1366)&&(path==='/admin'||path.includes('section=users')))await x.page.screenshot({path:join(tmpdir(),'chibasko-admin-'+(path==='/admin'?'overview':'users')+'-'+viewport.width+'.png'),fullPage:false})
  }
 }finally{await x.context.close()}
})

test('recherche, filtres serveur et pagination ne chargent que les données utiles',async()=>{
 const x=await fixture({path:'/admin?section=users'});try{
  await x.page.getByRole('button',{name:'Modifier Membre 000',exact:true}).waitFor()
  assert.equal(x.requests.some(request=>request.path==='/api/admin/games'),false)
  await x.page.getByRole('button',{name:'Suivant',exact:true}).click();await x.page.getByRole('button',{name:'Modifier Membre 050',exact:true}).waitFor()
  await x.page.getByLabel('Rechercher un utilisateur',{exact:true}).fill('Membre 00');await x.page.getByRole('button',{name:'Rechercher',exact:true}).click()
  await x.page.getByRole('button',{name:'Modifier Membre 000',exact:true}).waitFor()
  await x.page.getByLabel('Rôle du membre',{exact:true}).selectOption('developer')
  await x.page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Modifier Membre 002'))
  const last=x.requests.filter(request=>request.path==='/api/admin/users').at(-1)
  assert.deepEqual(last.search,{page:'1',search:'Membre 00',role:'developer'})
  const badges=await x.page.locator('tbody tr').first().textContent();assert.match(badges,/ADMIN/);assert.match(badges,/DÉVELOPPEUR/)
 }finally{await x.context.close()}
})

test('le raccourci des jeux publiés applique réellement son filtre serveur',async()=>{
 const x=await fixture();try{
  await x.page.getByRole('link',{name:'Jeux publiés',exact:true}).click()
  await x.page.getByRole('button',{name:'Modifier Jeu 000',exact:true}).waitFor()
  assert.equal(await x.page.getByLabel('Visibilité',{exact:true}).inputValue(),'published')
  assert.equal(x.requests.filter(request=>request.path==='/api/admin/games').at(-1).search.status,'published')
 }finally{await x.context.close()}
})

test('panneau utilisateur mobile : focus, sauvegarde avec instantané et conflit conservé',async()=>{
 for(const conflict of [false,true]){
  const x=await fixture({viewport:{width:390,height:844},path:'/admin?section=users',conflict});try{
   await x.page.getByRole('button',{name:'Modifier Membre 001',exact:true}).click()
   const input=x.page.getByLabel('Pseudo',{exact:true});await input.waitFor();assert.equal(await input.evaluate(el=>el===document.activeElement),true)
   await input.fill('Nouveau pseudo');await x.page.getByRole('button',{name:'Enregistrer le profil'}).click()
   if(conflict){await x.page.getByRole('alert').waitFor();assert.equal(await input.inputValue(),'Nouveau pseudo')}
   else await x.page.getByRole('button',{name:'Modifier Nouveau pseudo',exact:true}).waitFor()
   const write=x.requests.find(request=>request.method==='PATCH');assert.equal(write.body.expected.username,'Membre 001')
   assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  }finally{await x.context.close()}
 }
})

test('menu mobile, clavier et accès refusé',async()=>{
 const x=await fixture({viewport:{width:390,height:844}});try{
  const navigation=x.page.getByLabel('Section administrative',{exact:true});await navigation.focus();await navigation.selectOption('faq');await x.page.getByRole('heading',{name:'FAQ',exact:true,level:1}).waitFor()
  assert.equal(await x.page.evaluate(()=>document.activeElement!==document.body),true)
 }finally{await x.context.close()}
 const denied=await fixture({denied:true});try{await denied.page.getByText('Accès administrateur refusé.').waitFor();assert.equal(await denied.page.locator('[data-admin-console]').count(),0);assert.equal(denied.requests.every(request=>request.path==='/api/admin/status'),true)}finally{await denied.context.close()}
})

test('catégories, FAQ et panneau de jeu conservent leurs formulaires et leurs actions',async()=>{
 const x=await fixture({path:'/admin?section=categories',viewport:{width:390,height:844}});try{
  await x.page.getByRole('button',{name:'Ajouter une catégorie',exact:true}).click()
  await x.page.getByLabel('Nom de catégorie',{exact:true}).fill('Sport')
  await x.page.getByRole('button',{name:'Créer la catégorie',exact:true}).click()
  await x.page.getByRole('button',{name:'Modifier Sport',exact:true}).waitFor()
  await x.page.getByRole('button',{name:'Modifier Sport',exact:true}).click()
  await x.page.getByLabel('Nom de catégorie',{exact:true}).fill('Sports')
  await x.page.getByRole('button',{name:'Enregistrer la catégorie',exact:true}).click()
  await x.page.getByRole('button',{name:'Modifier Sports',exact:true}).waitFor()
  x.page.once('dialog',dialog=>dialog.accept());await x.page.getByRole('button',{name:'Supprimer Sports',exact:true}).click()
  await x.page.getByRole('button',{name:'Modifier Sports',exact:true}).waitFor({state:'detached'})
  await x.page.getByLabel('Section administrative',{exact:true}).selectOption('faq')
  await x.page.getByRole('button',{name:'Modifier Comment jouer ?',exact:true}).waitFor()
  await x.page.getByRole('button',{name:'Ajouter une question',exact:true}).click()
  await x.page.getByLabel('Question',{exact:true}).fill('Comment enregistrer un favori ?')
  await x.page.getByLabel('Réponse',{exact:true}).fill('Utilisez le bouton Favori du lecteur.')
  await x.page.getByRole('button',{name:'Créer la question',exact:true}).click()
  await x.page.getByRole('button',{name:'Modifier Comment enregistrer un favori ?',exact:true}).waitFor()
  x.page.once('dialog',dialog=>dialog.accept());await x.page.getByRole('button',{name:'Supprimer Comment enregistrer un favori ?',exact:true}).click()
  await x.page.getByRole('button',{name:'Supprimer Comment enregistrer un favori ?',exact:true}).waitFor({state:'detached'})
  await x.page.getByLabel('Section administrative',{exact:true}).selectOption('games')
  await x.page.getByRole('button',{name:'Ajouter un jeu',exact:true}).click()
  await x.page.getByLabel('Titre',{exact:true}).fill('Nouveau jeu')
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await x.page.getByRole('button',{name:'Fermer le formulaire',exact:true}).click()
  assert.equal(await x.page.getByLabel('Titre',{exact:true}).count(),0)
  assert.ok(x.requests.some(request=>request.method==='PATCH'&&request.path.includes('/categories/')))
  assert.ok(x.requests.some(request=>request.method==='POST'&&request.path==='/api/admin/faq'))
  assert.equal(x.requests.find(request=>request.method==='POST'&&request.path==='/api/admin/categories').body.slug,'sport')
  assert.equal(x.requests.find(request=>request.method==='PATCH'&&request.path.includes('/categories/')).body.slug,'sport')
 }finally{await x.context.close()}
})

test('revue de suppression : référence obligatoire, confirmation et reprise non finale',async()=>{
 const x=await fixture({path:'/admin/account-deletions'});try{
  const button=x.page.getByRole('button',{name:'Valider la vérification et poursuivre',exact:true});await button.waitFor();assert.equal(await button.isDisabled(),true)
  await x.page.getByLabel('Référence interne du document ou de la décision').fill('decision/2026-001')
  await x.page.getByLabel('J’ai vérifié les autorisations',{exact:false}).check()
  x.page.once('dialog',dialog=>dialog.accept());await button.click()
  await x.page.getByText('La demande reste en cours ; aucune suppression complète n’est annoncée.').waitFor()
  assert.equal(await x.page.getByLabel('J’ai vérifié les autorisations',{exact:false}).isChecked(),false)
  const write=x.requests.find(request=>request.method==='POST');assert.deepEqual(write.body,{reviewReference:'decision/2026-001'})
 }finally{await x.context.close()}
})

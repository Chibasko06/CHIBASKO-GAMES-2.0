import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {tmpdir} from 'node:os'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

let browser,script,css
before(async()=>{
 const result=await build({entryPoints:['tests/fixtures/dashboard-community-host.tsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'},plugins:[{name:'services-de-test',setup(b){
  b.onResolve({filter:/^@\/lib\/server\/supabaseSession$/},()=>({path:'serverSession',namespace:'fixture'}))
  b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'fixture'}))
  b.onResolve({filter:/supabaseClient$/},()=>({path:'db',namespace:'fixture'}))
  b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  b.onResolve({filter:/^@\/lib\/profileSync$/},()=>({path:'sync',namespace:'fixture'}))
  b.onResolve({filter:/^next\/(link|image|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{
   empty:'export {}',
   serverSession:`import {supabase} from '@/lib/supabaseClient';export async function createServerSupabase(){return supabase}`,
   auth:`const q=new URLSearchParams(location.search);const user=q.has('visitor')?null:{id:'11111111-1111-4111-8111-111111111111',email:'private@example.test'};const value={loading:false,user,session:user?{user,access_token:'fixture-token'}:null};export function useAuth(){return value}`,
   sync:`export async function ensureProfile(){return {ok:true}}`,
   navigation:`export function usePathname(){return location.pathname}export function useRouter(){return {replace(){},push(){}}}export function redirect(path){throw Error(path)}`,
   link:`import {createElement} from 'react';export default function Link(props){return createElement('a',props)}`,
   image:`import {createElement} from 'react';export default function Image({fill,priority,unoptimized,...props}){return createElement('img',props)}`,
   db:`const q=new URLSearchParams(location.search);const roles={admin:q.has('admin'),developer:q.has('developer')};const id='11111111-1111-4111-8111-111111111111';const profile={id,username:'Camille',bio:'Je crée des jeux et partage mes découvertes.',avatar_url:null,created_at:'2026-01-01'};const game={id:'game',slug:'jeu-test',title:'Un jeu au titre très long pour vérifier les débordements sur mobile',thumbnail_url:'/thumbnail.svg'};
   export const supabase={auth:{async signOut(){}},from(table){let head=false;const chain={select(fields,options){head=options?.head;return chain},eq(){return chain},order(){return chain},range(){return chain},abortSignal(){return chain},async single(){return {data:profile,error:null}},async maybeSingle(){return {data:profile,error:null}},then(resolve){return Promise.resolve({error:null,count:table==='favorites'?8:3,data:head?null:table==='favorites'?[{id:'favorite',created_at:'2026-10-24',games:game}]:[]}).then(resolve)}};return chain},async rpc(name,args){if(name==='catalogue_recent_history')return {data:[{historyId:'history',played_at:'2026-10-24',game}],error:null};if(q.has('failure'))return {data:null,error:{code:'08006',message:'private diagnostic'}};if(args.p_id)return {data:{items:[{...profile,roles}],total:1},error:null};let profiles=Array.from({length:49},(_,i)=>({id:'member-'+i,username:'Membre '+String(i).padStart(2,'0'),avatar_url:null,bio:i%3?'Présentation du membre.':null,created_at:'2026-01-01',roles:{admin:i%4===0,developer:i%4===1||i%4===0}}));profiles=profiles.filter(p=>p.username.toLowerCase().includes(args.p_search.toLowerCase())&&(args.p_role==='all'||p.roles[args.p_role]));return {data:{items:profiles.slice((args.p_page-1)*24,args.p_page*24),total:profiles.length},error:null}}}`,
  }[path]}))
 }}]})
 script=result.outputFiles[0].contents
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())

async function fixture(query='',viewport={width:1366,height:768},accountEnabled=false){
 const context=await browser.newContext({viewport}),calls=[]
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,'https://portal.test','Aucun accès distant dans les fixtures')
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(script)})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/thumbnail.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="45"><rect width="80" height="45" fill="#164e63"/></svg>'})
  if(url.pathname==='/api/admin/status')return route.fulfill({json:{isAdmin:false}})
  if(url.pathname==='/api/profile/public'){calls.push(route.request().postDataJSON());return route.fulfill({json:{profile:{id:'11111111-1111-4111-8111-111111111111',...calls.at(-1)}}})}
  if(url.pathname==='/api/account'){calls.push('delete');return route.fulfill({status:accountEnabled?202:503,json:accountEnabled?{deletion:{state:'review_required'}}:{error:'disabled'}})}
  if(url.pathname.endsWith('.png'))return route.fulfill({status:204})
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/host.js"></script></body></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test/fixture?'+query)
 await page.locator('main > *').first().waitFor()
 return {context,page,calls}
}

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1366,height:768},{width:1920,height:1080}]){
 test(`tableau de bord et communauté sans débordement ${viewport.width}×${viewport.height}`,async()=>{
  for(const kind of ['dashboard','directory']){const x=await fixture('kind='+kind+'&admin&developer',viewport);try{
   await x.page.getByRole('heading',{name:kind==='dashboard'?'Mon profil':'Communauté',exact:true}).waitFor()
   assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   assert.equal(await x.page.locator('h1').count(),1)
   if(kind==='dashboard'){
    assert.equal(await x.page.getByText('private@example.test',{exact:true}).count(),1)
    assert.equal(await x.page.getByRole('heading',{name:'Mon profil',exact:true}).count(),1)
    assert.equal(await x.page.getByRole('link',{name:/Voir mon profil public/}).getAttribute('href'),'/players/@camille')
    assert.equal(await x.page.getByRole('link',{name:/Un jeu au titre/}).count(),2)
    const image=await x.page.locator('main img').first().boundingBox();assert.ok(Math.abs(image.width/image.height-16/9)<.05)
   }else{
    assert.equal(await x.page.locator('main li').count(),24)
    assert.ok((await x.page.locator('main li a').first().getAttribute('href')).startsWith('/players/@'))
    assert.doesNotMatch(await x.page.locator('main').textContent(),/private@example|fixture-token/)
    const heights=await x.page.locator('main li').evaluateAll(items=>items.map(item=>Math.round(item.getBoundingClientRect().height)))
    assert.equal(new Set(heights).size,1,'Toutes les cartes conservent une hauteur uniforme')
   }
   if(viewport.width===390||viewport.width===1366)await x.page.screenshot({path:join(tmpdir(),`chibasko-${kind}-${viewport.width}.png`),fullPage:true})
  }finally{await x.context.close()}}
 })
}

test('édition du profil : focus, labels, sauvegarde et annulation',async()=>{
 const x=await fixture();try{
  await x.page.getByRole('button',{name:'Modifier le profil',exact:true}).click()
  const username=x.page.getByLabel('Pseudo',{exact:true});await username.waitFor();assert.equal(await username.evaluate(el=>el===document.activeElement),true)
  await username.fill('camille-studio');await x.page.getByLabel('Biographie',{exact:true}).fill('Nouveau profil')
  await x.page.getByRole('button',{name:'Sauvegarder',exact:true}).click();await x.page.getByRole('status').waitFor()
  assert.deepEqual(x.calls,[{username:'camille-studio',bio:'Nouveau profil'}])
  await x.page.getByRole('button',{name:'Modifier le profil',exact:true}).click();await username.fill('Ne pas conserver')
  await x.page.getByRole('button',{name:'Annuler',exact:true}).click();assert.equal(await username.count(),0)
  assert.equal(x.calls.length,1);await x.page.getByRole('link',{name:'Réinitialiser mon mot de passe'}).waitFor()
 }finally{await x.context.close()}
})

for(const roles of ['', 'admin','developer','admin&developer'])test('badges confirmés sur dashboard et profil : '+(roles||'standard'),async()=>{
 for(const kind of ['dashboard','profile']){const x=await fixture('kind='+kind+'&'+roles);try{
  await x.page.getByRole('heading',{name:kind==='dashboard'?'Mon profil':'Camille',exact:true}).waitFor()
  assert.equal(await x.page.locator('main').getByText('ADMIN',{exact:true}).count(),roles.includes('admin')?1:0)
  assert.equal(await x.page.locator('main').getByText('DÉVELOPPEUR',{exact:true}).count(),roles.includes('developer')?1:0)
 }finally{await x.context.close()}}
})

test('communauté : recherche et rôle préservés entre pages, résultat vide et panne distincts',async()=>{
 const x=await fixture('kind=directory');try{
  await x.page.getByRole('link',{name:'Suivant',exact:true}).click();await x.page.getByText('Page 2 sur 3').waitFor()
  assert.equal(await x.page.getByRole('heading',{name:'Membre 24',exact:true}).count(),1)
  await x.page.getByLabel('Rechercher un membre').fill('Membre 0');await x.page.getByLabel('Rôle',{exact:true}).selectOption('developer')
  await x.page.getByRole('button',{name:'Rechercher',exact:true}).click()
  // Le formulaire GET reste utilisable sans JavaScript ; la fixture conserve sa vue au rechargement.
  assert.equal(new URL(x.page.url()).searchParams.get('search'),'Membre 0')
  assert.equal(new URL(x.page.url()).searchParams.get('role'),'developer')
 }finally{await x.context.close()}
 for(const [query,text] of [['kind=directory&search=absent','Aucun membre trouvé'],['kind=directory&failure=1','La communauté est temporairement indisponible']]){
  const h=await fixture(query);try{await h.page.getByText(text,{exact:false}).waitFor();assert.doesNotMatch(await h.page.locator('main').textContent(),/private diagnostic/)}finally{await h.context.close()}
 }
})

for(const enabled of [false,true])test('suppression intégrée : confirmation et configuration '+enabled,async()=>{
 const x=await fixture('',undefined,enabled);try{
  const button=x.page.getByRole('button',{name:'Demander la suppression du compte'});await button.waitFor();assert.equal(await button.isDisabled(),true)
  await x.page.getByLabel('Saisissez SUPPRIMER pour confirmer').fill('SUPPRIMER');await button.click()
  if(enabled)await x.page.getByText('Demande enregistrée. Une vérification administrative',{exact:false}).waitFor()
  else await x.page.getByRole('alert').waitFor()
  assert.deepEqual(x.calls,['delete'])
 }finally{await x.context.close()}
})

test('visiteur et navigation Tous les jeux sur desktop et mobile',async()=>{
 for(const width of [390,1366]){const x=await fixture('visitor=1',{width,height:844});try{
  await x.page.getByRole('link',{name:'Connexion',exact:true}).last().waitFor()
  if(width===390)await x.page.getByRole('button',{name:'Ouvrir le menu'}).click()
  const link=x.page.getByRole('link',{name:'Tous les jeux',exact:true});await link.waitFor();assert.equal(await link.getAttribute('href'),'/games')
  assert.equal(await x.page.getByText('private@example.test',{exact:true}).count(),0)
 }finally{await x.context.close()}}
})

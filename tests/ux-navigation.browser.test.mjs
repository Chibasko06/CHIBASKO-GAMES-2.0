import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

let browser,script,css
before(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import {createRoot} from 'react-dom/client';import Search from './components/PlayerSearch';import AuthRequired from './components/AuthRequired';import FaqAnswer from './components/FaqAnswer';import UserDropdown from './components/UserDropdown';import Reactions from './components/GameReactions';import Reviews from './components/GameReviews';import Favorite from './components/FavoriteButton';import Login from './app/login/page';import Register from './app/register/page';import Callback from './app/auth/callback/page';
 const kind=new URLSearchParams(location.search).get('view');const content=kind==='login'?<Login/>:kind==='register'?<Register/>:kind==='callback'?<Callback/>:kind==='actions'?<><Reactions gameId="fixture"/><Favorite gameId="fixture"/><Reviews gameId="fixture"/></>:<><Search initialSearch=""/><AuthRequired/><FaqAnswer text="Utiliser uBlock Origin."/><UserDropdown user={{id:'viewer',email:'fixture@example.test'}} isAdmin={false}/></>;
 createRoot(document.getElementById('root')).render(<main>{content}</main>);
 `},bundle:true,write:false,outdir:'ux-fixture',jsx:'automatic',platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'services-isoles',setup(b){
 b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/^@\/lib\/profileSync$/},()=>({path:'sync',namespace:'fixture'}));b.onResolve({filter:/supabaseClient$/},()=>({path:'db',namespace:'fixture'}));b.onResolve({filter:/^next\/(link|image|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{
 auth:'export function useAuth(){return {user:null,session:null,loading:false}}',sync:'export async function ensureProfile(){window.calls.profile++;return {ok:true}}',
 link:'import {createElement} from "react";export default function Link({prefetch,children,...props}){return createElement("a",props,children)}',
 image:'import {createElement} from "react";export default function Image({unoptimized,priority,fill,...props}){return createElement("img",props)}',
 navigation:'const router={push(path){window.destination=path},replace(path){window.destination=path}};export function useRouter(){return router}export function usePathname(){return location.pathname}',
 db:`const session={access_token:'fixture',user:{id:'viewer'}};export const supabase={auth:{async signInWithPassword(){window.calls.login++;return {data:{session}}},async signUp(input){window.calls.signup=input;return {data:{session:location.search.includes('confirm')?null:session}}},async signInWithOAuth(input){window.calls.oauth=input;return {}},async getSession(){return {data:{session}}},onAuthStateChange(){return {data:{subscription:{unsubscribe(){}}}}},async signOut(){}},rpc(){const q={order(){return q},range(){return q},abortSignal(){return q},then(resolve){return Promise.resolve({data:[],count:0,error:null}).then(resolve)}};return q},from(){const q={select(){return q},eq(){return q},abortSignal(){return q},range(){return q},order(){return q},maybeSingle:async()=>({data:null}),then(resolve){return Promise.resolve({data:[],count:0}).then(resolve)}};return q}}`,
 }[path]}))
 }}]})
 script=result.outputFiles.find(file=>!file.path.endsWith('.css')).text
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:'app/globals.css'})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture(query='',width=390){
 const context=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390}),calls=[]
 await context.addInitScript(()=>{window.calls={login:0,profile:0}})
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/api/players/suggestions'){calls.push(url.searchParams.get('search'));return route.fulfill({json:{items:[{username:url.searchParams.get('search')+'-player',avatar_url:null}]}})}
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/host.js"></script></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test/games/pong?'+query)
 return {context,page,calls}
}
test('suggestions : seuil, frappe, suppression, clavier et recherche complète',async()=>{
 const x=await fixture();try{
  const input=x.page.getByRole('combobox')
  for(const value of ['','a','ab']){await input.fill(value);await x.page.waitForTimeout(350);assert.equal(x.calls.length,0)}
  await input.fill('chi');await x.page.getByRole('option',{name:'@chi-player'}).waitFor()
  await input.fill('chib');await x.page.getByRole('option',{name:'@chib-player'}).waitFor()
  await input.fill('chi');await x.page.getByRole('option',{name:'@chi-player'}).waitFor()
  await input.press('ArrowDown');assert.match(await input.getAttribute('aria-activedescendant'),/0$/)
  await input.press('Enter');await x.page.waitForFunction(()=>window.destination==='/players/@chi-player')
  await input.fill('ab');assert.equal(await x.page.getByRole('option').count(),0)
  await input.fill('joker');await x.page.getByRole('option').waitFor();await input.press('Escape');assert.equal(await input.getAttribute('aria-expanded'),'false')
  await input.press('Enter');await x.page.waitForURL('**/players?search=joker')
 }finally{await x.context.close()}
})
test('suggestions : ancienne réponse ignorée, sélection tactile et bouton recherche actualisé',async()=>{
 const x=await fixture();let release;const gate=new Promise(resolve=>release=resolve)
 await x.context.route('**/api/players/suggestions?search=chi',async route=>{await gate;try{await route.fulfill({json:{items:[{username:'ancien',avatar_url:null}]}})}catch{}})
 try{
  const input=x.page.getByRole('combobox');await input.fill('chi');await x.page.waitForTimeout(300)
  await input.fill('joker');await x.page.getByRole('option',{name:'@joker-player'}).waitFor();release();await x.page.waitForTimeout(100)
  assert.equal(await x.page.getByRole('option',{name:'@ancien'}).count(),0)
  await x.page.getByRole('option',{name:'@joker-player'}).tap();await x.page.waitForFunction(()=>window.destination==='/players/@joker-player')
  await input.fill('nouveau');await x.page.getByRole('button',{name:'Rechercher',exact:true}).click();await x.page.waitForURL('**/players?search=nouveau')
 }finally{release();await x.context.close()}
})
test('suggestions : aucun résultat et panne restent distincts, puis disparaissent sous le seuil',async()=>{
 const x=await fixture()
 await x.context.route('**/api/players/suggestions?search=vide',route=>route.fulfill({json:{items:[]}}))
 await x.context.route('**/api/players/suggestions?search=panne',route=>route.fulfill({status:503,json:{error:'indisponible'}}))
 try{
  const input=x.page.getByRole('combobox')
  await input.fill('vide');await x.page.getByText('Aucun joueur accessible avec ce pseudo.',{exact:true}).waitFor()
  await input.fill('panne');await x.page.getByText('Suggestions indisponibles. Tu peux lancer la recherche complète.',{exact:true}).waitFor()
  await input.fill('pa');assert.equal(await input.getAttribute('aria-expanded'),'false');assert.equal(await x.page.getByRole('listbox').count(),0)
 }finally{await x.context.close()}
})
for(const width of [390,768,1366])test('navigation, FAQ et retour Auth sans débordement à '+width,async()=>{
 const x=await fixture('mode=local',width);try{
  await x.page.getByRole('combobox').waitFor()
  for(const [label,path] of [['Se connecter','/login'],['Créer un compte','/register']]){
   const href=new URL(await x.page.getByRole('link',{name:label,exact:true}).getAttribute('href'),'https://portal.test')
   assert.equal(href.pathname,path);assert.equal(href.searchParams.get('next'),'/games/pong?mode=local')
  }
  assert.equal(await x.page.getByRole('link',{name:'uBlock Origin',exact:true}).getAttribute('href'),'https://github.com/gorhill/uBlock#installation')
  await x.page.getByRole('button',{name:'Mon compte',exact:true}).click()
  assert.equal(await x.page.getByRole('link',{name:'DÉCISIONS ET RECOURS'}).count(),0)
  await x.page.keyboard.press('Escape');assert.equal(await x.page.getByRole('button',{name:'Mon compte',exact:true}).evaluate(node=>node===document.activeElement),true)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await x.context.close()}
})
test('actions invité : réactions, favoris et avis proposent deux vrais boutons sans mutation',async()=>{
 for(const action of ['J’aime','Ajouter aux favoris','Publier mon avis']){
  const x=await fixture('view=actions');try{
   await x.page.getByRole('button',{name:action,exact:true}).click()
   await x.page.getByRole('link',{name:'Se connecter',exact:true}).waitFor()
   assert.equal(await x.page.getByRole('link',{name:'Créer un compte',exact:true}).count(),1)
   assert.equal(await x.page.evaluate(()=>window.calls.profile),0)
  }finally{await x.context.close()}
 }
})
for(const view of ['login','register','callback'])test('retour après '+view+' et absence de mutation initiale rejouée',async()=>{
 const next='/games/pong?mode=local',x=await fixture('view='+view+'&next='+encodeURIComponent(next));try{
  if(view==='login'){
   await x.page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await x.page.getByLabel('Mot de passe',{exact:true}).fill('fixture-password');await x.page.getByRole('button',{name:'Connexion',exact:true}).click()
  }else if(view==='register'){
   await x.page.getByLabel('Pseudo',{exact:true}).fill('fixture');await x.page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await x.page.getByLabel('Mot de passe',{exact:true}).fill('fixture-password');await x.page.getByRole('button',{name:"S'inscrire",exact:true}).click()
  }
  await x.page.waitForFunction(expected=>window.destination===expected,next)
  assert.equal(await x.page.evaluate(()=>window.calls.profile),1)
 }finally{await x.context.close()}
})
test('Google OAuth et confirmation e-mail transportent le retour interne',async()=>{
 const next='/games/pong',x=await fixture('view=register&confirm&next='+encodeURIComponent(next));try{
  await x.page.getByRole('button',{name:'Se connecter avec Google'}).click()
  const oauth=await x.page.evaluate(()=>window.calls.oauth);assert.equal(new URL(oauth.options.redirectTo).searchParams.get('next'),next)
  await x.page.getByLabel('Pseudo',{exact:true}).fill('fixture');await x.page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await x.page.getByLabel('Mot de passe',{exact:true}).fill('fixture-password');await x.page.getByRole('button',{name:"S'inscrire",exact:true}).click()
  await x.page.waitForFunction(()=>!!window.calls.signup)
  const signup=await x.page.evaluate(()=>window.calls.signup);assert.equal(new URL(signup.options.emailRedirectTo).searchParams.get('next'),next)
  assert.equal(await x.page.evaluate(()=>window.destination),undefined)
 }finally{await x.context.close()}
})

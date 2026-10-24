import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
let browser,js,css
before(async()=>{
 const bundle=await build({entryPoints:['tests/fixtures/contact-accessibility-host.tsx'],bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'services-locaux',setup(b){
 b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
 b.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'fixture'}))
 b.onResolve({filter:/^@\/lib\/profileSync$/},()=>({path:'profile',namespace:'fixture'}))
 b.onResolve({filter:/^@\/lib\/queries\/games$/},()=>({path:'reviews',namespace:'fixture'}))
 b.onResolve({filter:/^next\/(link|image|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),loader:'js',contents:{
 auth:"const value={user:null,session:null,loading:false};export function useAuth(){return value}",
 supabase:"export const supabase={auth:{async signInWithPassword(){window.authenticationCalls=(window.authenticationCalls??0)+1;return {data:{session:{}},error:null}},async signOut(){}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:null,error:null}}}},async rpc(){return {data:[],error:null}}}",
 profile:"export async function ensureProfile(){return {ok:true}}",reviews:"export async function getGameReviewsPage(){return {items:[],total:0,average:0}}",
 navigation:"export function useRouter(){return {replace(){window.navigationCalls=(window.navigationCalls??0)+1},push(){}}}export function useSearchParams(){return new URLSearchParams(location.search)}",
 link:"import {createElement} from 'react';export default function Link(props){return createElement('a',props)}",
 image:"import {createElement} from 'react';export default function Image({fill,priority,unoptimized,...props}){return createElement('img',props)}",
 }[path]}))
 }}]})
 js=bundle.outputFiles[0].contents
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function setup(kind='contact',{viewport={width:390,height:844},send=async route=>route.fulfill({json:{status:'accepted'}})}={}){
 const context=await browser.newContext({viewport}),calls=[]
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url())
  if(url.hostname!=='portal.test')throw Error('Requête externe interdite')
  if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><a class="skip-link" href="#main-content">Aller au contenu</a><main id="main-content" tabindex="-1"><div id="root"></div><span class="animate-pulse" id="motion">Chargement</span></main><script src="/host.js"></script></body></html>'})
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(js)})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/api/contact'){calls.push(route.request().postDataJSON());return send(route)}
  return route.fulfill({status:204})
 })
 const page=await context.newPage();await page.goto('https://portal.test/fixture?kind='+kind)
 await page.locator('#root > *').first().waitFor()
 return {page,context,calls}
}
async function fill(page){for(const [label,text] of [['Nom','Test'],['Prénom','Élodie'],['Adresse e-mail','sender@example.test'],['Ton message','Bonjour']])await page.getByLabel(label,{exact:true}).fill(text)}
for(const viewport of [{width:390,height:844},{width:1366,height:768}])test(`contact clavier, labels, erreurs et confirmation ${viewport.width}`,async()=>{
 const x=await setup('contact',{viewport});try{
  await x.page.keyboard.press('Tab');assert.equal(await x.page.locator(':focus').textContent(),'Aller au contenu')
  await x.page.keyboard.press('Enter');assert.equal(await x.page.locator('main').evaluate(el=>el===document.activeElement),true)
  await x.page.getByRole('button',{name:'Envoyer le message'}).click();await x.page.getByRole('alert').waitFor()
  const invalid=x.page.locator('input[aria-invalid="true"]').first();const description=await invalid.getAttribute('aria-describedby');assert.ok(description);assert.equal(await x.page.locator('[id="'+description+'"]').textContent(),'Ce champ est obligatoire.')
  await fill(x.page);await x.page.getByRole('button',{name:'Envoyer le message'}).click();await x.page.getByRole('status').waitFor()
  assert.equal(x.calls.length,1);assert.equal(await x.page.getByLabel('Ton message').inputValue(),'')
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await x.context.close()}
})
test('réponse ambiguë puis reprise : même clé, même contenu, aucun double clic',async()=>{
 let release
 const x=await setup('contact',{send:async route=>{if(!release)return new Promise(resolve=>{release=async()=>{await route.fulfill({status:202,json:{status:'unconfirmed'}});resolve()}});return route.fulfill({json:{status:'accepted'}})}})
 try{await fill(x.page);const button=x.page.getByRole('button',{name:'Envoyer le message'});await button.click();await x.page.getByRole('button',{name:'Envoi en cours…'}).waitFor();assert.equal(x.calls.length,1);await release();await x.page.getByRole('button',{name:'Vérifier l’envoi'}).click();await x.page.getByRole('status').waitFor();assert.deepEqual(x.calls[0],x.calls[1])}finally{await x.context.close()}
})
test('notes accessibles : radios natifs, flèches et commentaire nommé',async()=>{
 const x=await setup('reviews');try{
  const selected=x.page.getByRole('radio',{name:'5 sur 5'});await selected.focus();await x.page.keyboard.press('ArrowLeft');assert.equal(await x.page.getByRole('radio',{name:'4 sur 5'}).isChecked(),true)
  await x.page.keyboard.press('Tab');assert.equal(await x.page.getByLabel('Ton commentaire').evaluate(el=>el===document.activeElement),true)
  await x.page.getByRole('button',{name:'Publier mon avis'}).click();await x.page.getByRole('status').waitFor()
 }finally{await x.context.close()}
})
test('authentification : labels persistants et connexion avec Entrée',async()=>{
 for(const kind of ['login','register','reset']){const x=await setup(kind);try{
  await x.page.getByLabel('Email',{exact:true}).waitFor()
  if(kind==='login'){await x.page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await x.page.getByLabel('Mot de passe',{exact:true}).fill('fixture-password');await x.page.keyboard.press('Enter');await x.page.waitForFunction(()=>window.navigationCalls===1);assert.equal(await x.page.evaluate(()=>window.authenticationCalls),1)}
 }finally{await x.context.close()}}
})
test('menu compte : Échap et tabulation rendent le focus au parcours du document',async()=>{
 const x=await setup('account');try{
  const button=x.page.getByRole('button',{name:'Mon compte'});await button.click();await x.page.getByRole('link',{name:'TABLEAU DE BORD'}).waitFor();await x.page.keyboard.press('Escape');assert.equal(await button.evaluate(el=>el===document.activeElement),true)
  await button.click();await x.page.getByRole('button',{name:'DECONNEXION'}).focus();await x.page.keyboard.press('Tab');assert.equal(await x.page.locator('#next-control').evaluate(el=>el===document.activeElement),true)
 }finally{await x.context.close()}
})
test('navigation mobile : fermeture clavier et préférence de mouvement réduit',async()=>{
 const x=await setup('navigation');try{
  const button=x.page.getByRole('button',{name:'Ouvrir le menu'});await button.click();await x.page.keyboard.press('Escape');assert.equal(await button.getAttribute('aria-expanded'),'false');assert.equal(await button.evaluate(el=>el===document.activeElement),true)
  await x.page.emulateMedia({reducedMotion:'reduce'});assert.ok(parseFloat(await x.page.locator('#motion').evaluate(el=>getComputedStyle(el).animationDuration))<.001)
 }finally{await x.context.close()}
})

test('une panne réseau libère le bouton et conserve la demande pour une vérification sûre',async()=>{
 const x=await setup('contact',{send:route=>route.abort('failed')});try{
  await fill(x.page);await x.page.getByRole('button',{name:'Envoyer le message'}).click()
  const retry=x.page.getByRole('button',{name:'Vérifier l’envoi'});await retry.waitFor();assert.equal(await retry.isEnabled(),true)
  await retry.click();await x.page.getByText('La connexion a été interrompue.',{exact:false}).waitFor()
  assert.equal(x.calls.length,2);assert.deepEqual(x.calls[0],x.calls[1])
 }finally{await x.context.close()}
})

test('le texte secondaire conserve un contraste suffisant sur le fond sombre',async()=>{
 const x=await setup();try{
  const ratio=await x.page.evaluate(()=>{
   const element=document.createElement('span');element.className='text-zinc-500';element.style.backgroundColor='#09090b';element.textContent='Texte secondaire';document.body.append(element)
   const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
   const style=getComputedStyle(element),a=luminance(style.color),b=luminance(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)
  });assert.ok(ratio>=4.5,String(ratio))
 }finally{await x.context.close()}
})

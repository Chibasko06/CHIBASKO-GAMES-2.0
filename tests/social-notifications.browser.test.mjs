import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
const id=n=>'fb400000-0000-4000-8000-'+String(n).padStart(12,'0')
let browser,script,css
before(async()=>{
 const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import {createRoot} from 'react-dom/client';import {Navbar} from './components/Navbar';import Menu from './components/GameSharingMenu';import Shared from './components/SharedGames';createRoot(document.getElementById('root')).render(<><Navbar/><main className="mx-auto max-w-3xl p-4"><h1>Jeu de test</h1><Menu gameId="${id(4)}" title="Jeu de test" url="https://chibaskogames.fr/games/jeu-test"/>{!window.fixture.guest&&<Shared actorId="${id(1)}" token="fixture"/>}</main></>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'services-de-test',setup(b){
  b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  b.onResolve({filter:/^@\/lib\/supabaseClient$/},()=>({path:'db',namespace:'fixture'}))
  b.onResolve({filter:/^next\/(?:link|image|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:{auth:`export const useAuth=()=>({loading:false,user:window.fixture.guest?null:{id:'${id(1)}',email:'fixture@example.test'},session:window.fixture.guest?null:{access_token:'fixture'}})`,db:`export const supabase={auth:{signOut:async()=>({error:null})}}`,link:`import {createElement} from 'react';export default p=>createElement('a',p)`,image:`import {createElement} from 'react';export default({unoptimized,priority,...p})=>createElement('img',p)`,navigation:`export const useRouter=()=>({push(){},refresh(){}});export const usePathname=()=>'/games/jeu-test'`}[path]}))
 }}]});script=bundle.outputFiles[0].text
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture(width=1366,guest=false){
 const context=await browser.newContext({viewport:{width,height:844}}),calls=[],model={read:false,accepted:false,sent:false,failRead:false,pauseShares:false,releaseShares:null}
 let startedShares
 const sharesStarted=new Promise(resolve=>{startedShares=resolve})
 await context.addInitScript(({guest})=>{window.fixture={guest,copied:[]};Object.defineProperty(navigator,'share',{value:undefined,configurable:true});Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>window.fixture.copied.push(value)}})},{guest})
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  if(url.pathname==='/api/social'){calls.push({path:url.pathname,body:request.postDataJSON()});model.accepted=true;return route.fulfill({json:{state:'friends',relationId:id(3)}})}
  if(url.pathname==='/api/social/notifications'){
   const body=request.method()==='POST'?request.postDataJSON():null,view=url.searchParams.get('view');calls.push({view,body})
   if(view==='navigation')return route.fulfill({json:{data:{avatarUrl:null,isAdmin:false,unreadCount:10}}})
   if(view==='count')return route.fulfill({json:{data:0}})
   if(body?.action==='read'){model.read=true;return route.fulfill({json:{data:0}})}
   if(body?.action==='share'){model.sent=true;return route.fulfill({json:{data:{sent:true,replayed:false}}})}
   if(view==='friends')return route.fulfill({json:{data:{items:[{id:id(3),createdAt:'2026-10-29T12:00:00Z',profile:{id:id(2),username:'ami-test',avatar_url:null}}],nextCursor:null}}})
   if(model.failRead){model.failRead=false;return route.fulfill({status:503,json:{error:'Lecture indisponible.'}})}
   const item={id:id(5),createdAt:'2026-10-29T12:00:00Z',kind:view==='shares'?'game_shared':'friend_request',read:model.read||model.accepted,actionable:view!=='shares'&&!model.accepted,relationId:id(3),sender:{id:id(2),username:'ami-test'},game:view==='shares'?{slug:'jeu-test',title:'Jeu recommandé'}:null}
   const data={items:[item],nextCursor:null,unreadCount:item.read?0:1,readIds:item.read?[]:[id(5)]}
   if(view==='shares'&&model.pauseShares){startedShares();await new Promise(resolve=>{model.releaseShares=resolve})}
   return route.fulfill({json:{data}})
  }
  if(/\.(png|svg)$/.test(url.pathname))return route.fulfill({status:404,body:''})
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body class="bg-black text-white"><div id="root"></div><script src="/host.js"></script></body></html>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test/games/jeu-test');return {context,page,calls,model,sharesStarted}
}
for(const width of [390,768,1366,1920])test(`cloche et partage accessibles à ${width}px, lectures à la demande`,async()=>{
 const x=await fixture(width);try{
  const bell=x.page.getByRole('button',{name:/Notifications/});await bell.waitFor();await x.page.getByText('9+',{exact:true}).waitFor()
  assert.deepEqual(x.calls.map(c=>c.view),['navigation'])
  await bell.click();const dialog=x.page.getByRole('dialog',{name:'Notifications'});await dialog.getByRole('button',{name:'Accepter',exact:true}).waitFor()
  assert.equal(await dialog.getByRole('link',{name:'@ami-test'}).getAttribute('href'),'/players/@ami-test')
  await dialog.getByRole('button',{name:'Accepter',exact:true}).click();await x.page.waitForFunction(()=>!document.querySelector('dialog button')?.disabled)
  await dialog.getByText('Demande terminée.').waitFor();assert.equal(x.calls.filter(c=>c.body?.action==='accept').length,1)
  await x.page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await bell.evaluate(node=>node===document.activeElement),true)
  await x.page.getByLabel('Partager ce jeu').click();await x.page.getByRole('button',{name:'Partager à un ami',exact:true}).click()
  const picker=x.page.getByRole('dialog',{name:'Partager à un ami'});await picker.getByRole('button',{name:'Partager',exact:true}).click();await picker.getByRole('button',{name:'Envoyé'}).waitFor();assert.equal(x.calls.filter(c=>c.body?.action==='share').length,1)
  await x.page.keyboard.press('Escape');await x.page.getByRole('button',{name:'Voir les recommandations'}).click();await x.page.getByRole('link',{name:'Jeu recommandé'}).waitFor()
  assert.ok(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
 }finally{await x.context.close()}
})
test('invité : partage public sans lecture ou écriture privée',async()=>{
 const x=await fixture(390,true);try{assert.equal(await x.page.getByRole('button',{name:/Notifications/}).count(),0);await x.page.getByLabel('Partager ce jeu').click();await x.page.getByRole('button',{name:'Partager un lien'}).click();await x.page.getByText('Lien copié.').waitFor();assert.deepEqual(await x.page.evaluate(()=>window.fixture.copied),['https://chibaskogames.fr/games/jeu-test']);assert.equal(x.calls.length,0)}finally{await x.context.close()}
})
test('échec de lecture distinct du vide, reprise manuelle et compteur synchronisé après lecture',async()=>{
 const x=await fixture();try{
  await x.page.getByText('9+',{exact:true}).waitFor();x.model.failRead=true
  await x.page.getByRole('button',{name:/Notifications/}).click();const dialog=x.page.getByRole('dialog',{name:'Notifications'})
  await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByText('Aucune notification pour le moment.').count(),0)
  await dialog.getByRole('button',{name:'Actualiser',exact:true}).click();await dialog.getByRole('button',{name:'Tout marquer comme lu'}).click()
  await x.page.getByRole('button',{name:'Notifications, aucune non lue'}).waitFor();assert.equal(x.calls.filter(call=>call.body?.action==='read').length,1)
  await x.page.keyboard.press('Escape');await x.page.getByRole('button',{name:/Notifications/}).click();await dialog.getByRole('button',{name:'Accepter',exact:true}).waitFor()
  assert.equal(await dialog.getByText('Non lue',{exact:true}).count(),0)
 }finally{await x.context.close()}
})
test('partage natif et copie manuelle : URL canonique, texte et aucune écriture',async()=>{
 const x=await fixture(390,true);try{
  await x.page.evaluate(()=>{Object.defineProperty(navigator,'share',{value:async data=>{window.fixture.shared=data},configurable:true})})
  await x.page.getByLabel('Partager ce jeu').click();await x.page.getByRole('button',{name:'Partager un lien'}).click();await x.page.getByText('Lien partagé.',{exact:true}).waitFor()
  assert.deepEqual(await x.page.evaluate(()=>window.fixture.shared),{title:'Jeu de test',text:'Essaie ce jeu sur Chibasko Games !',url:'https://chibaskogames.fr/games/jeu-test'})
  await x.page.evaluate(()=>{Object.defineProperty(navigator,'share',{value:undefined});navigator.clipboard.writeText=async()=>{throw Error('Copie refusée')}})
  await x.page.getByRole('button',{name:'Partager un lien'}).click();await x.page.getByLabel('Lien du jeu').waitFor();assert.equal(await x.page.getByLabel('Lien du jeu').inputValue(),'https://chibaskogames.fr/games/jeu-test')
  assert.equal(x.calls.length,0)
 }finally{await x.context.close()}
})
test('une lecture ancienne des recommandations ne restaure pas le compteur après marquage',async()=>{
 const x=await fixture();try{
  await x.page.getByText('9+',{exact:true}).waitFor();x.model.pauseShares=true
  await x.page.getByRole('button',{name:'Voir les recommandations'}).click();await x.sharesStarted
  await x.page.getByRole('button',{name:/Notifications/}).click();const dialog=x.page.getByRole('dialog',{name:'Notifications'})
  await dialog.getByRole('button',{name:'Tout marquer comme lu'}).click();await x.page.getByRole('button',{name:'Notifications, aucune non lue'}).waitFor()
  x.model.releaseShares();await x.page.keyboard.press('Escape');await x.page.getByRole('link',{name:'Jeu recommandé'}).waitFor()
  assert.equal(await x.page.getByRole('button',{name:'Notifications, aucune non lue'}).count(),1)
 }finally{await x.context.close()}
})

import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
let browser,js,css
before(async()=>{
 const bundle=await build({entryPoints:['tests/fixtures/catalogue-interface-host.tsx'],bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,outdir:'.distribution/catalogue-interface',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'fixture-services',setup(build){
 build.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
 build.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'fixture'}))
 build.onResolve({filter:/^@\/lib\/profileSync$/},()=>({path:'profile',namespace:'fixture'}))
 build.onResolve({filter:/^@\/lib\/queries\/favorites$/},()=>({path:'favorites',namespace:'fixture'}))
 build.onResolve({filter:/^next\/(link|image|navigation)$/},({path})=>({path:path.split('/')[1],namespace:'fixture'}))
 build.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),loader:'js',contents:{
 auth:"const user={id:'fixture-user',email:'fixture@example.test'},session={access_token:'fixture-only',user};export function useAuth(){return {user,session,loading:false}}",
 supabase:"export const supabase={auth:{async signOut(){}},from(){return {select(){return this},eq(){return this},abortSignal(){return this},async maybeSingle(){return {data:null,error:null}}}},async rpc(){return {data:[],error:null}}}",
 profile:"export async function ensureProfile(){return {ok:true}}",
 favorites:"export async function isFavorite(){return false} export async function addFavorite(){} export async function removeFavorite(){} export async function getFavoriteGamesPage(user,page){window.favoriteRead={user,page};return {items:[{id:'favorite',slug:'favorite',title:'Favori',thumbnail_url:'/cover.svg',categories:[]}],total:1205}}",
 navigation:"export function usePathname(){return window.location.pathname} export function useRouter(){return {push(){},replace(path){window.catalogueNavigation=path}}} export function useSearchParams(){return new URLSearchParams(window.location.search)}",
 link:"import {createElement} from 'react';export default function Link(props){return createElement('a',props)}",
 image:"import {createElement} from 'react';export default function Image({fill,priority,unoptimized,...props}){return createElement('img',{...props,style:fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:props.style})}",
 }[path]}))
 }}]})
 js=bundle.outputFiles.find(file=>file.path.endsWith('.js')).contents
 const globalCss=await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:resolve('app/globals.css')})
 css=globalCss.css+'\n'+new TextDecoder().decode(bundle.outputFiles.find(file=>file.path.endsWith('.css')).contents)
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function setup(pageKind,viewport,count=16){
 const context=await browser.newContext({viewport})
 await context.route('**/*',route=>{
 const url=new URL(route.request().url())
 if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>'})
 if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(js)})
 if(url.pathname==='/fixture.css')return route.fulfill({contentType:'text/css',body:css})
 if(url.pathname==='/chibaskogames-logo.png')return route.fulfill({contentType:'image/png',body:readFileSync('public/chibaskogames-logo.png')})
 if(url.pathname==='/logo-chibaskogames-rond.ico')return route.fulfill({contentType:'image/x-icon',body:readFileSync('public/logo-chibaskogames-rond.ico')})
 if(url.pathname==='/api/admin/status')return route.fulfill({json:{isAdmin:true}})
 if(url.pathname==='/cover.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 225"><rect width="400" height="225" fill="#164e63"/></svg>'})
 return route.fulfill({status:404,body:''})
 })
 const page=await context.newPage();await page.goto('https://portal.test/');await page.waitForFunction(()=>!!window.catalogueFixture)
 await page.evaluate(options=>window.catalogueFixture.render(options),{page:pageKind,count});await page.locator('header').waitFor();await page.waitForTimeout(100)
 return {page,context}
}
for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:768,height:1024},{width:390,height:844}])test('home responsive row '+viewport.width,async()=>{
 const x=await setup('home',viewport)
 try{
 const track=x.page.getByRole('region',{name:'Action',exact:true}),metrics=await track.evaluate(node=>{const r=node.getBoundingClientRect();return {width:node.clientWidth,scrollWidth:node.scrollWidth,visible:[...node.children].filter(child=>{const c=child.getBoundingClientRect();return c.x>=r.x-1 && c.right<=r.right+1}).length,scrollbar:getComputedStyle(node).scrollbarWidth}})
 console.log('HOME '+viewport.width+' '+JSON.stringify(metrics))
 assert.equal(metrics.visible,viewport.width===1920?5:viewport.width===1366?4:viewport.width===768?3:1);assert.equal(metrics.scrollbar,'none')
 const previous=x.page.getByRole('button',{name:'Précédents : Action',includeHidden:true}),next=x.page.getByRole('button',{name:'Suivants : Action',includeHidden:true})
 assert.equal(await track.locator(':scope > div').count(),10)
 const cards=await track.locator('article').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {height:r.height,image:node.firstElementChild.getBoundingClientRect().height,stats:node.querySelector('[class*="stats"]').getBoundingClientRect().y-r.y,footer:node.querySelector('[class*="footer"]').getBoundingClientRect().y-r.y}}))
 for(const card of cards)assert.deepEqual(card,cards[0])
 assert.equal(cards[0].height,376);assert.equal(cards[0].image,160)
 await track.getByRole('heading',{name:'Chibasko Pong',exact:true}).waitFor({state:'attached'})
 const pong=track.locator('article').filter({has:x.page.getByRole('heading',{name:'Chibasko Pong',exact:true})})
 assert.equal(await pong.getByText('Multijoueur',{exact:true}).count(),1);assert.equal(await pong.getByText('2 joueurs',{exact:true}).count(),1)
 assert.equal(await pong.locator('[class*="badges"] span').evaluateAll(nodes=>nodes.every(node=>{const r=node.getBoundingClientRect(),p=node.closest('[class*="badges"]').getBoundingClientRect();return r.width>0 && r.height>0 && r.x>=p.x-1 && r.right<=p.right+1 && r.y>=p.y-1 && r.bottom<=p.bottom+1})),true,'all multiplayer badges remain inside their reserved slot')
 const rail=await track.locator('..').boundingBox(),trackBounds=await track.boundingBox()
 assert.equal(rail.height,trackBounds.height,'navigation must reserve no space beneath cards')
 if(viewport.width>600){
 const overlay=await next.boundingBox();assert.ok(overlay.y>=trackBounds.y && overlay.y+overlay.height<=trackBounds.y+trackBounds.height);assert.ok(overlay.height>=cards[0].height-1)
 assert.equal(await next.evaluate(node=>getComputedStyle(node).borderRadius),'0px')
 }else assert.equal(await next.isVisible(),false)
 assert.equal(await previous.isDisabled(),true);assert.equal(await next.isDisabled(),false)
 if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:'.distribution/home-initial-'+viewport.width+'.png',fullPage:true})
 if(viewport.width>600){await next.focus();await x.page.keyboard.press('Enter')}else await track.evaluate(node=>node.scrollBy({left:node.clientWidth,behavior:'instant'}));await x.page.waitForTimeout(650);assert.equal(await previous.isDisabled(),false)
 await track.evaluate(node=>node.scrollTo({left:(node.scrollWidth-node.clientWidth)/2,behavior:'instant'}));await x.page.waitForTimeout(100);assert.equal(await previous.isDisabled(),false);assert.equal(await next.isDisabled(),false)
 await track.evaluate(node=>node.scrollTo({left:node.scrollWidth,behavior:'instant'}));await x.page.waitForTimeout(100);assert.equal(await next.isDisabled(),true)
 assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:'.distribution/home-row-'+viewport.width+'.png',fullPage:true})
 }finally{await x.context.close()}
})
test('non-overflowing row has no navigation buttons and reacts to resizing',async()=>{
 const x=await setup('home',{width:1920,height:1080},3)
 try{assert.equal(await x.page.getByRole('group',{name:'Défilement : Action'}).count(),0);await x.page.setViewportSize({width:390,height:844});await x.page.waitForFunction(()=>{const node=document.querySelector('[aria-label="Action"]');return node.scrollWidth>node.clientWidth});await x.page.setViewportSize({width:1920,height:1080});await x.page.waitForTimeout(100);assert.equal(await x.page.getByRole('group',{name:'Défilement : Action'}).count(),0)}finally{await x.context.close()}
})
for(const pageKind of ['home','game','admin'])test('account menu stacks above '+pageKind,async()=>{
 const x=await setup(pageKind,{width:1920,height:1080})
 try{
 await x.page.getByRole('button',{name:'Mon compte',exact:true}).click();const menu=x.page.getByRole('navigation',{name:'Menu du compte'})
 assert.equal(await menu.isVisible(),true)
 assert.equal(await menu.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.bottom-8))}),true)
 assert.equal(await x.page.locator('header').evaluate(node=>getComputedStyle(node).zIndex),'20')
 if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({path:'.distribution/account-menu-'+pageKind+'.png',fullPage:true})
 }finally{await x.context.close()}
})

for(const viewport of [{width:1920,height:1080},{width:1680,height:1080},{width:1679,height:1080},{width:1366,height:768},{width:768,height:1024},{width:390,height:844}])test('recommendations responsive breakpoint with site CSS '+viewport.width,async()=>{
 const x=await setup('game',viewport)
 try{
 const surface=await x.page.locator('[data-player-surface]').boundingBox(),aside=await x.page.getByRole('complementary',{name:'À découvrir aussi'}).boundingBox()
 if(viewport.width>=1680){assert.ok(aside.x>=surface.x+surface.width);assert.ok(Math.abs(surface.width-1280)<1 && Math.abs(surface.height-720)<1);assert.equal(await x.page.getByRole('group',{name:'Défilement : Jeux recommandés'}).count(),0)}else assert.ok(aside.y>=surface.y+surface.height)
 if(viewport.width===1366)assert.ok(Math.abs(surface.width-1120)<1 && Math.abs(surface.height-630)<1)
 assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 if(process.env.RUNTIME_SCREENSHOTS==='1')await x.page.screenshot({fullPage:true,path:'.distribution/site-recommendations-'+viewport.width+'.png'})
 }finally{await x.context.close()}
})

for(const pageKind of ['home','game','admin'])test('account portal escapes clipping and follows its anchor on '+pageKind,async()=>{
 const x=await setup(pageKind,{width:1920,height:1080})
 try{
 if(pageKind==='game')await x.page.locator('[data-stacking-probe]').evaluate(node=>{node.style.display='none'})
 await x.page.locator('header').evaluate(node=>{node.style.zIndex='0';node.style.overflow='hidden';node.style.transform='translateZ(0)'})
 await x.page.locator('main').evaluate(node=>{node.style.zIndex='5'})
 const button=x.page.getByRole('button',{name:'Mon compte',exact:true})
 await button.click();const menu=x.page.getByRole('navigation',{name:'Menu du compte'})
 assert.equal(await menu.evaluate(node=>node.parentElement===document.body),true)
 assert.equal(await menu.evaluate(node=>getComputedStyle(node).position),'fixed')
 const first=await menu.boundingBox(),anchor=await button.boundingBox();assert.ok(Math.abs(first.y-anchor.y-anchor.height-8)<1)
 assert.equal(await menu.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height-8))}),true)
 await x.page.setViewportSize({width:1366,height:768});await x.page.waitForTimeout(100)
 let bounds=await menu.boundingBox(),trigger=await button.boundingBox();assert.ok(Math.abs(bounds.x+bounds.width-trigger.x-trigger.width)<1)
 await x.page.evaluate(()=>{const footer=document.createElement('div');footer.style.height='2000px';document.body.append(footer);scrollTo(0,15)})
 await x.page.waitForTimeout(100);bounds=await menu.boundingBox();trigger=await button.boundingBox();assert.ok(Math.abs(bounds.y-trigger.y-trigger.height-8)<1)
 await x.page.keyboard.press('Escape');assert.equal(await menu.count(),0);assert.equal(await button.evaluate(node=>document.activeElement===node),true)
 await button.click();await menu.waitFor();await x.page.mouse.click(5,300);assert.equal(await menu.count(),0)
 }finally{await x.context.close()}
})

test('account portal covers transformed cards',async()=>{
 const x=await setup('home',{width:1920,height:1080})
 try{
 await x.page.locator('[data-stacking-probe]').evaluate(node=>{node.style.display='none'})
 await x.page.getByRole('button',{name:'Mon compte',exact:true}).click()
 const menu=x.page.getByRole('navigation',{name:'Menu du compte'})
 assert.equal(await menu.evaluate(node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.bottom-8))}),true)
 }finally{await x.context.close()}
})

for(const width of [1920,1366,768])test('catalogue and home share card geometry '+width,async()=>{
 const catalogue=await setup('catalogue',{width,height:1080}),home=await setup('home',{width,height:1080});
 try{
 const geometry=node=>{const card=node.getBoundingClientRect();return {width:card.width,height:card.height,image:node.firstElementChild.getBoundingClientRect().height,font:getComputedStyle(node.querySelector('h3')).fontSize}};
 const reference=await catalogue.page.locator('article').first().evaluate(geometry);
 assert.equal(reference.height,376);assert.ok(Math.abs(reference.width-(width===1920?352:width===1366?309.5:720/3-32/3))<.02);
 for(const label of ['Action','Arcade'])for(const card of await home.page.getByRole('region',{name:label,exact:true}).locator('article').all())assert.deepEqual(await card.evaluate(geometry),reference);
 for(const card of await home.page.locator('[data-popular] article').all())assert.deepEqual(await card.evaluate(geometry),reference);
 console.log('CARD REFERENCE '+width+' '+JSON.stringify(reference));
 }finally{await catalogue.context.close();await home.context.close()}
})

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1366,height:768},{width:1920,height:1080}])test('recherche du catalogue et images stables '+viewport.width,async()=>{
 const x=await setup('catalogue',viewport)
 try{
  await x.page.evaluate(()=>window.catalogueFixture.render({page:'catalogue',total:1205,cataloguePage:2}))
  const pagination=x.page.getByRole('navigation',{name:'Pages du catalogue'})
  assert.equal(await pagination.getByRole('link',{name:'Précédent'}).getAttribute('href'),'/games')
  assert.equal(await pagination.getByRole('link',{name:'Suivant'}).getAttribute('href'),'/games?page=3')
  const before=await x.page.locator('article').first().boundingBox()
  await x.page.getByPlaceholder('Titre, categorie, studio, techno...').fill('Pong')
  assert.equal(await x.page.evaluate(()=>window.catalogueNavigation),undefined)
  await x.page.getByRole('button',{name:'Rechercher',exact:true}).click()
  assert.equal(await x.page.evaluate(()=>window.catalogueNavigation),'/games?search=Pong')
  const after=await x.page.locator('article').first().boundingBox()
  assert.equal(after.width,before.width);assert.equal(after.height,before.height)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await x.context.close()}
})

for(const width of [390,1366])test('favoris : page URL, pagination partagée et changement de page '+width,async()=>{
 const x=await setup('favorites',{width,height:844})
 try{
  const render=async(page)=>{
   await x.page.evaluate(page=>{
    history.replaceState(null,'','/favorites?page='+page)
    window.catalogueFixture.render({page:'favorites'})
   },page)
   await x.page.waitForFunction(page=>window.favoriteRead?.page===page,page)
   await x.page.getByRole('navigation',{name:'Pages des favoris'}).getByText('Page '+page+' sur 51',{exact:true}).waitFor()
  }
  await render(25)
  const nav=x.page.getByRole('navigation',{name:'Pages des favoris'})
  assert.equal(await nav.locator('[aria-current="page"]').innerText(),'25')
  assert.equal(await nav.getByRole('link',{name:'Page 24',exact:true}).getAttribute('href'),'/favorites?page=24')
  assert.equal(await nav.getByRole('link',{name:'Page 1',exact:true}).isVisible(),width>=640)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await render(1)
  assert.equal(await nav.getByRole('button',{name:'Précédent',exact:true}).isDisabled(),true)
  await render(51)
  assert.equal(await nav.getByRole('button',{name:'Suivant',exact:true}).isDisabled(),true)
  await render(2)
  assert.equal(await nav.getByRole('link',{name:'Précédent',exact:true}).getAttribute('href'),'/favorites')
 }finally{await x.context.close()}
})

for(const width of [390,1366])test('pagination numérotée, bornes et filtres partageables '+width,async()=>{
 const x=await setup('catalogue',{width,height:844})
 try{
  const render=async(page,total=1205)=>{
   await x.page.evaluate(({page,total})=>{
    history.replaceState(null,'','/games?category=action&search=Pong&sort=recent&page='+page)
    window.catalogueFixture.render({page:'catalogue',total,cataloguePage:page})
   },{page,total})
   await x.page.getByRole('navigation',{name:'Pages du catalogue'}).getByText('Page '+page+' sur '+Math.max(1,Math.ceil(total/24)),{exact:true}).waitFor()
  }
  const nav=x.page.getByRole('navigation',{name:'Pages du catalogue'})
  await render(1)
  assert.equal(await nav.getByRole('button',{name:'Précédent',exact:true}).isDisabled(),true)
  assert.equal(await nav.locator('[aria-current="page"]').count(),1)
  await render(25)
  assert.equal(await nav.locator('[aria-current="page"]').innerText(),'25')
  for(const number of [24,26]){
   const link=nav.getByRole('link',{name:'Page '+number,exact:true})
   assert.equal(await link.isVisible(),true)
   const url=new URL(await link.getAttribute('href'),'https://portal.test')
   assert.equal(url.searchParams.get('page'),String(number))
   assert.equal(url.searchParams.get('search'),'Pong')
   assert.equal(url.searchParams.get('category'),'action')
   assert.equal(url.searchParams.get('sort'),'recent')
  }
  assert.equal(await nav.getByRole('link',{name:'Page 1',exact:true}).isVisible(),width>=640)
  assert.equal(await nav.getByText('…',{exact:true}).count(),2)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await nav.getByRole('link',{name:'Page 24',exact:true}).focus()
  assert.equal(await nav.getByRole('link',{name:'Page 24',exact:true}).evaluate(node=>document.activeElement===node),true)
  await render(51)
  assert.equal(await nav.getByRole('button',{name:'Suivant',exact:true}).isDisabled(),true)
  await render(1,0)
  assert.equal(await nav.getByRole('button',{name:'Précédent',exact:true}).isDisabled(),true)
  assert.equal(await nav.getByRole('button',{name:'Suivant',exact:true}).isDisabled(),true)
  await render(2,72)
  assert.equal(await nav.getByRole('link',{name:/^Page \d+$/}).count(),3)
  assert.equal(await nav.getByText('…',{exact:true}).count(),0)
 }finally{await x.context.close()}
})

import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFileSync} from 'node:fs'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
let browser,script,css
before(async()=>{
 script=(await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import {createRoot} from 'react-dom/client';import Banner from './components/AdComfortMessage';import Faq from './components/FaqAnswer';import Avatar from './components/ProfileAvatarImage';createRoot(document.getElementById('root')).render(<main><Banner/><h1>Jeux Chibasko Games</h1><p style={{whiteSpace:'pre-line'}}><Faq text={'Installez [Mon extension](https://github.com/gorhill/uBlock#installation).\\nVoir https://brave.com/fr/download/. <img src=x onerror=alert(1)> [non](javascript:alert(1))'}/></p><Avatar src="https://lh3.googleusercontent.com/a/expired" alt="Avatar joueur" width={64} height={64} fallback="P"/></main>);`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'image-isolee',setup(b){b.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:'import {createElement} from "react";export default function Image({unoptimized,priority,fill,...props}){return createElement("img",props)}'}))}}]})).outputFiles[0].text
 css=(await postcss([tailwind()]).process(readFileSync('app/globals.css','utf8'),{from:'app/globals.css'})).css
 browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture(width=390){
 const context=await browser.newContext({viewport:{width,height:844}})
 await context.route('**/*',route=>{
  const url=new URL(route.request().url())
  if(url.hostname==='lh3.googleusercontent.com')return route.fulfill({status:404,body:''})
  assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(url.pathname==='/style.css')return route.fulfill({contentType:'text/css',body:css})
  return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>'})
 })
 const page=await context.newPage();return {context,page}
}
for(const width of [390,768,1366])test('FAQ et conseil accessibles sans débordement à '+width,async()=>{
 const x=await fixture(width);try{
  await x.page.goto('https://portal.test/');await x.page.getByRole('complementary',{name:'Conseil pour le confort de jeu'}).waitFor()
  assert.equal(await x.page.getByRole('complementary').count(),1)
  const link=x.page.getByRole('link',{name:'Mon extension',exact:true});assert.equal(await link.getAttribute('href'),'https://github.com/gorhill/uBlock#installation');assert.equal(await link.getAttribute('rel'),'noopener noreferrer')
  assert.equal(await x.page.locator('a[href^="javascript:"]').count(),0);assert.equal(await x.page.locator('p img').count(),0)
  await link.focus();assert.equal(await link.evaluate(node=>node===document.activeElement),true)
  const close=x.page.getByRole('button',{name:'Masquer ce conseil pendant 30 jours'});await close.focus();await x.page.keyboard.press('Enter');assert.equal(await x.page.getByRole('complementary').count(),0)
  assert.equal(await x.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 }finally{await x.context.close()}
})
for(const start of ['/','/games/fixture'])test('fermeture partagée 30 jours depuis '+start,async()=>{
 const x=await fixture();try{
  await x.page.goto('https://portal.test'+start);await x.page.getByRole('button',{name:'Masquer ce conseil pendant 30 jours'}).click()
  const cookie=(await x.context.cookies()).find(item=>item.name==='cg-advice-until');assert.ok(cookie);assert.equal(cookie.path,'/');assert.equal(cookie.secure,true);assert.ok(Math.abs(Number(cookie.value)-Date.now()-30*86400000)<60000)
  await x.page.goto('https://portal.test'+(start==='/'?'/games/fixture':'/'));await x.page.getByRole('heading').waitFor();assert.equal(await x.page.getByRole('complementary').count(),0)
  await x.context.addCookies([{name:'cg-advice-until',value:String(Date.now()-1000),domain:'portal.test',path:'/'}]);await x.page.reload();await x.page.getByRole('complementary').waitFor()
 }finally{await x.context.close()}
})
test('photo indisponible : avatar de repli et absence de référent transmis',async()=>{
 const x=await fixture();try{
  let referer
  await x.context.route('https://lh3.googleusercontent.com/**',route=>{referer=route.request().headers().referer;return route.fulfill({status:404,body:''})})
  await x.page.goto('https://portal.test/');const avatar=x.page.getByRole('img',{name:'Avatar joueur',exact:true});await avatar.filter({hasText:'P'}).waitFor();assert.equal(await avatar.evaluate(node=>node.tagName),'SPAN');assert.equal(referer,undefined)
 }finally{await x.context.close()}
})
test('fermeture immédiate même si le navigateur refuse les cookies',async()=>{
 const x=await fixture();try{
  await x.page.goto('https://portal.test/');await x.page.getByRole('complementary').waitFor()
  await x.page.evaluate(()=>Object.defineProperty(document,'cookie',{configurable:true,get(){return ''},set(){throw new DOMException('Blocked','SecurityError')}}))
  await x.page.getByRole('button',{name:'Masquer ce conseil pendant 30 jours'}).click();assert.equal(await x.page.getByRole('complementary').count(),0)
 }finally{await x.context.close()}
})

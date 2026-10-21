import test from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {ANALYTICS_CONSENT_DEFAULT_SCRIPT} from '../lib/analyticsConsent.ts'

const fixtureCmp=`(() => {
 const fields=['analyticsStoragePurposeConsentStatus','adStoragePurposeConsentStatus','adUserDataPurposeConsentStatus','adPersonalizationPurposeConsentStatus'];
 let values=JSON.parse(localStorage.getItem('fixture-cmp-choice')||'null');const waiting=[],listeners=[];
 window.googlefc={getGoogleConsentModeValues:()=>values,callbackQueue:{push(entry){for(const [key,callback] of Object.entries(entry)){if(key==='CONSENT_API_READY'||values)callback();else waiting.push(callback)}}}};
 window.__tcfapi=(command,version,callback)=>{listeners.push(callback);callback({eventStatus:values?'tcloaded':'cmpuishown',cmpStatus:'loaded'},true)};
 window.cmpFixture={choose(status){values=typeof status==='number'?Object.fromEntries(fields.map(key=>[key,status])):status;localStorage.setItem('fixture-cmp-choice',JSON.stringify(values));waiting.splice(0).forEach(fn=>fn());listeners.forEach(fn=>fn({eventStatus:'useractioncomplete',cmpStatus:'loaded'},true))},open(){listeners.forEach(fn=>fn({eventStatus:'cmpuishown'},true))},listeners:()=>listeners.length};
})();`
const stubTag=`(() => {let consent={},configured=false;const consume=raw=>{const x=Array.from(raw);if(x[0]==='consent')Object.assign(consent,x[2]);if(x[0]==='config')configured=true;if(configured&&consent.analytics_storage==='granted'&&!window['ga-disable-G-H10SZPPWWX']){document.cookie='_ga=fixture; Path=/';document.cookie='_ga_H10SZPPWWX=fixture; Path=/';}};dataLayer.forEach(consume);const push=dataLayer.push.bind(dataLayer);dataLayer.push=(...items)=>{const result=push(...items);items.forEach(consume);return result};})();`
const tag=process.env.GA_REAL_TAG_TEST==='1'?await(await fetch('https://www.googletagmanager.com/gtag/js?id=G-H10SZPPWWX')).text():stubTag
const bundle=(await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import {StrictMode} from 'react';import{createRoot}from'react-dom/client';import SiteAnalytics from './components/SiteAnalytics';createRoot(document.getElementById('root')!).render(<StrictMode><SiteAnalytics/></StrictMode>);`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'pathname-fixture',setup(api){api.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));api.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',resolveDir:process.cwd(),contents:`import{useSyncExternalStore}from'react';export function usePathname(){return useSyncExternalStore(fn=>{window.addEventListener('fixture-route',fn);return()=>window.removeEventListener('fixture-route',fn)},()=>location.pathname,()=>'/')}`}))}}]})).outputFiles[0].text
const browser=await chromium.launch({channel:'chrome',headless:true})
async function setup(){
 const context=await browser.newContext(),hits=[];let loads=0
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname==='www.googletagmanager.com'&&url.pathname==='/gtag/js'){loads++;return route.fulfill({contentType:'application/javascript',body:tag})}if(url.pathname.endsWith('/collect')){hits.push({path:url.pathname,event:url.searchParams.get('en')});return route.fulfill({status:204,body:''})}if(url.origin==='https://portal.test')return route.fulfill({contentType:'text/html',body:'<!doctype html><script>'+ANALYTICS_CONSENT_DEFAULT_SCRIPT+'</script><script>'+fixtureCmp+'</script><div id="root"></div><script>'+bundle+'</script>'});return route.abort()})
 const page=await context.newPage();await page.goto('https://portal.test');await page.waitForFunction(()=>cmpFixture.listeners()===1)
 return {context,page,hits,loads:()=>loads}
}
const gaCookies=async x=>(await x.context.cookies()).filter(c=>c.name.startsWith('_ga'))
const commands=x=>x.page.evaluate(()=>dataLayer.map(x=>Array.from(x)).filter(x=>['consent','config'].includes(x[0])))
try{
 await test('browser A/C: no choice, refusal and NOT_CONFIGURED never load GA or create cookies',async()=>{
  const x=await setup();try{assert.equal((await commands(x))[0][1],'default');assert.equal(x.loads(),0);assert.equal((await gaCookies(x)).length,0);await x.page.evaluate(()=>cmpFixture.choose(2));await x.page.waitForTimeout(100);assert.equal((await commands(x)).at(-1)[2].analytics_storage,'denied');assert.equal(x.loads(),0);await x.page.evaluate(()=>cmpFixture.choose(4));await x.page.waitForTimeout(100);assert.equal(x.loads(),0);assert.equal((await gaCookies(x)).length,0);assert.equal(x.hits.length,0)}finally{await x.context.close()}
 })
 await test('browser B/D/E: accept, revoke, restore saved choice and reaccept without double config',async()=>{
  const x=await setup();try{
   await x.page.evaluate(()=>cmpFixture.choose(1));await x.page.waitForFunction(()=>document.cookie.includes('_ga='));assert.equal(x.loads(),1)
   let list=await commands(x);assert.equal(list.filter(c=>c[0]==='config').length,1);assert.ok(list.findIndex(c=>c[1]==='update'&&c[2].analytics_storage==='granted')<list.findIndex(c=>c[0]==='config'))
   await x.page.evaluate(()=>cmpFixture.open());await x.page.evaluate(()=>cmpFixture.choose(2));await x.page.waitForFunction(()=>window['ga-disable-G-H10SZPPWWX']===true);assert.equal((await commands(x)).at(-1)[2].analytics_storage,'denied')
   await x.page.waitForTimeout(300);const collected=x.hits.length;await x.page.evaluate(()=>gtag('event','page_view'));await x.page.waitForTimeout(500);assert.equal(x.hits.length,collected)
   await x.page.reload();await x.page.waitForFunction(()=>cmpFixture.listeners()===1);await x.page.waitForTimeout(100);assert.equal(x.loads(),1);assert.equal((await commands(x)).filter(c=>c[0]==='config').length,0)
   await x.page.evaluate(()=>cmpFixture.choose(1));await x.page.waitForFunction(()=>window['ga-disable-G-H10SZPPWWX']===false);await x.page.waitForTimeout(200);assert.equal(x.loads(),2);assert.equal((await commands(x)).filter(c=>c[0]==='config').length,1)
   await x.page.evaluate(()=>cmpFixture.choose(1));await x.page.waitForTimeout(100);assert.equal(x.loads(),2);assert.equal((await commands(x)).filter(c=>c[0]==='config').length,1)
   await x.page.reload();await x.page.waitForFunction(()=>document.getElementById('chibasko-google-analytics-tag'));assert.equal((await commands(x)).filter(c=>c[0]==='config').length,1)
  }finally{await x.context.close()}
 })
 await test('browser: private navigation remains blocked despite CMP updates and public navigation cannot override refusal',async()=>{
  const x=await setup();try{await x.page.evaluate(()=>{history.pushState({},'','/games/test/lobby/fixture-code');dispatchEvent(new Event('fixture-route'))});await x.page.evaluate(()=>cmpFixture.choose(1));await x.page.waitForTimeout(100);assert.equal(x.loads(),0);await x.page.evaluate(()=>{history.pushState({},'','/games/test');dispatchEvent(new Event('fixture-route'))});await x.page.waitForFunction(()=>document.cookie.includes('_ga='));await x.page.evaluate(()=>cmpFixture.choose(2));await x.page.waitForFunction(()=>window['ga-disable-G-H10SZPPWWX']);await x.page.evaluate(()=>{history.pushState({},'','/games/other');dispatchEvent(new Event('fixture-route'))});await x.page.waitForTimeout(100);assert.equal(await x.page.evaluate(()=>window['ga-disable-G-H10SZPPWWX']),true)}finally{await x.context.close()}
 })
 console.log('Analytics browser tag:',process.env.GA_REAL_TAG_TEST==='1'?'real public Google tag; collection intercepted':'offline tag fixture')
}finally{await browser.close()}


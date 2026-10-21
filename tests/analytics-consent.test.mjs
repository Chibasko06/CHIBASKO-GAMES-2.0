import test from 'node:test'
import assert from 'node:assert/strict'
import {JSDOM} from 'jsdom'
import {readFile} from 'node:fs/promises'
import {ANALYTICS_CONSENT_DEFAULT_SCRIPT,DENIED_CONSENT,googleConsentState,connectAnalyticsConsent} from '../lib/analyticsConsent.ts'
const keys=['analyticsStoragePurposeConsentStatus','adStoragePurposeConsentStatus','adUserDataPurposeConsentStatus','adPersonalizationPurposeConsentStatus']
const values=n=>Object.fromEntries(keys.map(key=>[key,n]))
function fixture(stored){
 const dom=new JSDOM('',{url:'https://portal.example/games/test?private=fixture#discard',runScripts:'outside-only'}),win=dom.window
 win.eval(ANALYTICS_CONSENT_DEFAULT_SCRIPT)
 let current=stored,listener,count=0;const pending=[]
 win.googlefc={getGoogleConsentModeValues:()=>current,callbackQueue:{push(entry){for(const [key,fn]of Object.entries(entry)){if(key==='CONSENT_API_READY'||current)fn();else pending.push(fn)}}}}
 win.__tcfapi=(_command,version,fn)=>{assert.equal(version,2);count++;listener=fn;fn({eventStatus:current?'tcloaded':'cmpuishown',cmpStatus:'loaded'},true)}
 const controller=connectAnalyticsConsent(win)
 return {win,dom,controller,count:()=>count,commands:()=>win.dataLayer.map(x=>Array.from(x)),choose:async next=>{current=next;pending.splice(0).forEach(fn=>fn());listener({eventStatus:'useractioncomplete'},true);await new Promise(resolve=>setTimeout(resolve,10))},show:()=>listener({eventStatus:'cmpuishown'},true)}
}
test('all defaults are denied and no config/tag exists without a CMP choice',()=>{
 const x=fixture();try{assert.deepEqual(x.commands()[0].slice(0,2),['consent','default']);assert.equal(JSON.stringify(x.commands()[0][2]),JSON.stringify(DENIED_CONSENT));assert.equal(x.win.document.scripts.length,0);assert.equal(x.commands().some(c=>c[0]==='config'),false)}finally{x.dom.window.close()}
})
test('Google enum values map explicitly; unknown, missing, inapplicable and unconfigured fail closed',()=>{
 for(const n of [undefined,0,2,3,4,99])assert.deepEqual(googleConsentState(n===undefined?undefined:values(n)),DENIED_CONSENT)
 assert.deepEqual(googleConsentState(values(1)),{analytics_storage:'granted',ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted'})
 assert.equal(googleConsentState({...values(2),analyticsStoragePurposeConsentStatus:1}).ad_storage,'denied')
})
test('acceptance updates before one config and duplicate/StrictMode connections never initialize twice',async()=>{
 const x=fixture();try{await x.choose(values(1));const list=x.commands();assert.ok(list.findIndex(c=>c[0]==='consent'&&c[1]==='update'&&c[2].analytics_storage==='granted')<list.findIndex(c=>c[0]==='config'));assert.equal(connectAnalyticsConsent(x.win),x.controller);await x.choose(values(1));assert.equal(x.count(),1);assert.equal(x.commands().filter(c=>c[0]==='config').length,1);assert.equal(x.win.document.scripts.length,1);assert.equal(x.win['ga-disable-G-H10SZPPWWX'],false);assert.doesNotMatch(JSON.stringify(x.commands().find(c=>c[0]==='config')),/private=|discard/)}finally{x.dom.window.close()}
})
test('refusal and unconfigured consent do not load Analytics; revocation disables loaded Analytics',async()=>{
 const x=fixture();try{await x.choose(values(2));assert.equal(x.win.document.scripts.length,0);await x.choose(values(4));assert.equal(x.win.document.scripts.length,0);await x.choose(values(1));x.show();assert.equal(x.win['ga-disable-G-H10SZPPWWX'],true);await x.choose(values(2));assert.equal(x.commands().at(-1)[2].analytics_storage,'denied');assert.equal(x.win['ga-disable-G-H10SZPPWWX'],true);assert.equal(x.commands().filter(c=>c[0]==='config').length,1)}finally{x.dom.window.close()}
})
test('stored consent restores through CMP and private pages remain blocked until public navigation',async()=>{
 const x=fixture(values(1));try{await new Promise(r=>setTimeout(r,10));assert.equal(x.win['ga-disable-G-H10SZPPWWX'],false);x.win.history.pushState({},'','/games/test/lobby/private-code');x.controller.setPrivatePage(true);await x.choose(values(1));assert.equal(x.win['ga-disable-G-H10SZPPWWX'],true);x.win.history.pushState({},'','/games/test');x.controller.setPrivatePage(false);assert.equal(x.win['ga-disable-G-H10SZPPWWX'],false);assert.equal(x.commands().filter(c=>c[0]==='config').length,1)}finally{x.dom.window.close()}
})
test('document head initializes defaults before the unchanged AdSense tag',async()=>{
 const layout=await readFile(new URL('../app/layout.tsx',import.meta.url),'utf8'),component=await readFile(new URL('../components/SiteAnalytics.tsx',import.meta.url),'utf8')
 assert.ok(layout.indexOf('id="analytics-consent-default"')<layout.indexOf('src="https://pagead2.googlesyndication.com'))
 assert.match(layout,/ca-pub-9977547315559489/);assert.doesNotMatch(component,/gtag\('config'|googletagmanager.com\/gtag/)
})

import test,{before,after} from 'node:test'
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'

let browser,script
before(async()=>{
 const result=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';import Page from './app/dashboard/blocked/page';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',plugins:[{name:'services-locaux',setup(b){
  b.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({loader:'js',resolveDir:process.cwd(),contents:path==='auth'?`export function useAuth(){return {loading:false,session:location.search.includes('guest')?null:{access_token:'fixture'}}}`:`import {createElement} from 'react';export default function Link(props){return createElement('a',props)}`}))
 }}]})
 script=result.outputFiles[0].text;browser=await chromium.launch({channel:'chrome',headless:true})
})
after(async()=>browser?.close())
async function fixture(query='',ambiguous=false){
 const context=await browser.newContext({viewport:{width:390,height:844}}),calls=[]
 let blocked=true
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,'https://portal.test')
  if(url.pathname==='/bundle.js')return route.fulfill({contentType:'text/javascript',body:script})
  if(url.pathname==='/api/social'){
   calls.push({method:request.method(),body:request.method()==='POST'?request.postDataJSON():null})
   if(request.method()==='POST'){blocked=false;if(ambiguous)return route.abort();return route.fulfill({json:{state:'none'}})}
   return route.fulfill({json:{items:blocked?[{id:'fe000000-0000-4000-8000-000000000001',profile:{id:'fe000000-0000-4000-8000-000000000002',username:'joueur-bloque'}}]:[],nextCursor:null}})
  }
  return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/bundle.js"></script>'})
 })
 const page=await context.newPage();await page.goto('https://portal.test/dashboard/blocked'+query)
 return {context,page,calls}
}
test('un invité ne charge aucune liste privée',async()=>{
 const {context,page,calls}=await fixture('?guest')
 try{await page.getByRole('link',{name:/Connecte-toi/}).waitFor();assert.equal(calls.length,0)}finally{await context.close()}
})
for(const ambiguous of [false,true])test('le déblocage réconcilie l’état sans répéter la mutation : '+ambiguous,async()=>{
 const {context,page,calls}=await fixture('',ambiguous)
 try{
  await page.getByRole('button',{name:'Débloquer @joueur-bloque'}).click()
  await page.getByText('Aucun compte bloqué.').waitFor()
  assert.equal(calls.filter(c=>c.method==='POST').length,1)
  assert.equal(calls.filter(c=>c.method==='GET').length,2)
  assert.equal(calls.find(c=>c.body)?.body.relationId,'fe000000-0000-4000-8000-000000000001')
  assert.equal(await page.getByRole('button',{name:'Actualiser'}).isEnabled(),true)
 }finally{await context.close()}
})

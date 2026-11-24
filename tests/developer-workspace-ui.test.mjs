import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement,act} from 'react'
import {createRoot} from 'react-dom/client'
import {renderToStaticMarkup} from 'react-dom/server'
import {JSDOM} from 'jsdom'
import Workspace from '../components/DeveloperWorkspace.tsx'
import Navigation from '../components/DeveloperNavigation.tsx'
test('workspace has its own navigation and does not require the user dashboard',()=>{
 globalThis.__productAuth={session:null,loading:false}
 const html=renderToStaticMarkup(createElement(Navigation))
 for(const path of ['/developer/games','/developer/submissions','/developer/statistics','/developer/resources'])assert.ok(html.includes(path))
 assert.doesNotMatch(html,/service_role|fixture-token/)
})
for(const mode of ['new','update'])test('game detail preserves the game while preparing a '+mode+' correction',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://portal.test/developer/games/fixture-game'})
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch}
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true
 globalThis.__productAuth={session:{user:{id:'actor'},access_token:'fixture-token'},loading:false};window.confirm=()=>true
 const requests=[];globalThis.fetch=async(url,options)=>{requests.push([url,options]);return Response.json({data:options?.method==='POST'?{mode,gameId:'fixture-game'}:{games:[{id:'fixture-game',title:'Projet',isPublished:false,buildCount:1,revisionCount:0,recordedViews:0,favorites:0,reviews:0}],builds:[{id:'fixture-build',version:'1.0.0',createdAt:'2026-11-23T10:00:00Z',technicalStatus:'failed',decision:'pending',reason:'Corriger le manifeste',submissionId:'fixture-submission',versionStatus:null,history:[]}],external:[]}})}
 const root=createRoot(document.getElementById('root'))
 try{
  await act(async()=>{root.render(createElement(Workspace,{gameId:'fixture-game'}));await new Promise(r=>setTimeout(r,20))})
  assert.match(document.body.textContent,/Corriger le manifeste/);assert.match(document.body.textContent,/Temps de jeu, rétention/)
  assert.doesNotMatch(document.body.textContent,/Invalid Date|NaN/)
  const button=[...document.querySelectorAll('button')].find(b=>b.textContent==='Remplacer par un build corrigé');assert.ok(button)
  await act(async()=>{button.click();await new Promise(r=>setTimeout(r,10))})
  const [,options]=requests.find(([,options])=>options?.method==='POST');assert.deepEqual(JSON.parse(options.body),{action:'prepare-correction',gameId:'fixture-game',uploadId:'fixture-build'})
  assert.equal(globalThis.__productNavigation,mode==='update'?'/publier-un-jeu?mode=update&game=fixture-game':'/publier-un-jeu?draft=fixture-game')
 }finally{await act(async()=>root.unmount());dom.window.close();Object.assign(globalThis,saved);delete globalThis.IS_REACT_ACT_ENVIRONMENT}
})

import test from 'node:test'
import assert from 'node:assert/strict'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {existsSync} from 'node:fs'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
import Guide from '../app/developpeurs/page.tsx'
import Privacy from '../app/confidentialite/page.tsx'
import Cookies from '../app/cookies/page.tsx'
import Legal from '../app/mentions-legales/page.tsx'
import Submit from '../components/SubmitGamePageClient.tsx'
import Footer from '../components/Footer.tsx'
import {manifestExample,manifestCode,archiveLimitBytes,lifecycleCode,audioCode,resizeCode,sdkInstallCommand} from '../lib/developer-guide.ts'
import {validateManifest} from '../lib/game-distribution/manifest.ts'
const html=component=>renderToStaticMarkup(createElement(component))

test('guide manifest follows the real validator and upload policy; no private game identity is used',()=>{
 assert.deepEqual(validateManifest(JSON.parse(manifestCode),manifestExample),manifestExample)
 assert.equal(manifestExample.schemaVersion,1);assert.equal(manifestExample.integrationVersion,1)
 assert.deepEqual(manifestExample.client.entrypoints,{local:'local/index.html'})
 assert.equal(archiveLimitBytes,524288000);assert.equal(sdkInstallCommand,'npm install @chibaskogames/sdk@0.4.0')
 assert.doesNotMatch(manifestCode,/0509712e|endpoint|credential|email|contactEmail/)
})

test('guide, legal pages and navigation expose valid internal links without operational secrets or fictitious consent',()=>{
 globalThis.__productAuth={session:null,loading:false}
 const pages=[html(Guide),html(Privacy),html(Cookies),html(Legal),html(Footer),renderToStaticMarkup(createElement(Submit,{categories:[]}))]
 for(const page of pages){
  assert.doesNotMatch(page,/SUPABASE_SERVICE_ROLE_KEY|staging_key|multipart_id|lease_token|GAME_SUBMISSION_NOTIFY_EMAIL|service_role/)
  const ids=new Set([...page.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]))
  for(const [,href]of page.matchAll(/href="([^"?#]+|#[^"]+)"/g)){
   if(href.startsWith('#'))assert.ok(ids.has(href.slice(1)),href)
   else if(href.startsWith('/')){const pathname=href.split('?')[0];assert.ok(existsSync(new URL('../app'+pathname+'/page.tsx',import.meta.url))||existsSync(new URL('../public'+pathname,import.meta.url)),href)}
  }
 }
 assert.match(pages[0],/Aucun hébergement multijoueur en libre-service/)
 assert.doesNotMatch(pages[0],/npm run (?:build:web|validate:web|pack:web)|fixedViewport/)
 assert.match(pages[5],/Consulter le guide développeur/);assert.match(pages[4],/Développeurs/)
 globalThis.__productAuth={session:{user:{id:'fixture-account'},access_token:'fixture-only'},loading:false}
 assert.match(renderToStaticMarkup(createElement(Submit,{categories:[]})),/Consulter le guide développeur/)
 assert.match(pages[2],/plateforme de gestion du consentement Google/)
 assert.doesNotMatch(pages[2],/Aucun gestionnaire de consentement/)
 assert.doesNotMatch(pages[3],/ne peut etre tenu responsable|SIRET :|capital de/)
})

test('documented JavaScript executes READY, START/STOP, exit, resize, initial audio, changes and cleanup',async()=>{
 const events=new Map(),off=[],status={textContent:''},canvas={},media={muted:false,volume:1};let quit,start,stop,change,ready=false,closed=false,left=false
 class Media{}
 Object.setPrototypeOf(media,Media.prototype)
 const platform={context:{execution:'local'},ready(){assert.ok(start&&stop);ready=true},onStart(fn){start=fn;return()=>off.push('start')},onStop(fn){stop=fn;return()=>off.push('stop')},close(){closed=true},leave(){left=true},audio:{getState:()=>({muted:true,volume:0}),onChange(fn){change=fn;fn({muted:true,volume:0});return()=>off.push('audio')}}}
 const window={innerWidth:390,innerHeight:220,addEventListener(name,fn){events.set(name,[...(events.get(name)??[]),fn])},removeEventListener(name,fn){events.set(name,events.get(name).filter(item=>item!==fn))}}
 const document={querySelector(selector){return selector==='#status'?status:selector==='canvas'?canvas:{addEventListener(_name,fn){quit=fn}}},querySelectorAll:()=>[media]}
 const code=lifecycleCode.replace("import { connectPlatform } from '@chibaskogames/sdk/client';",'const connectPlatform = async () => fixturePlatform;')
 await vm.runInNewContext('(async()=>{'+code+'\n'+audioCode+'\n'+resizeCode+'})()',{fixturePlatform:platform,window,document,HTMLMediaElement:Media})
 assert.equal(ready,true);assert.equal(media.muted,true);assert.equal(canvas.width,390)
 start({execution:'local'});assert.equal(status.textContent,'Prêt à jouer en local')
 start({execution:'online',online:{}});assert.equal(status.textContent,'Connexion gameplay à préparer');stop()
 change({muted:false,volume:.4});assert.equal(media.volume,.4);assert.equal(media.muted,false)
 window.innerWidth=844;window.innerHeight=390;events.get('resize')[0]();assert.equal(canvas.width,844);assert.equal(canvas.height,390)
 quit();assert.equal(left,true);for(const fn of events.get('pagehide'))fn();assert.equal(closed,true);assert.deepEqual(off,['start','stop','audio']);assert.equal(events.get('resize').length,0)
})

test('missing legal identity and consent gaps stay explicit in the audit; publication terms remain an internal draft',async()=>{
 const report=await readFile(new URL('../docs/developer-portal-legal-audit.md',import.meta.url),'utf8'),terms=await readFile(new URL('../docs/conditions-publication.projet.md',import.meta.url),'utf8')
 assert.match(report,/À FOURNIR : statut exact/);assert.match(report,/Écart bloquant/);assert.match(report,/FormSubmit/)
 assert.match(terms,/Brouillon de travail/);assert.match(terms,/aucune\s+propriété intellectuelle/)
})

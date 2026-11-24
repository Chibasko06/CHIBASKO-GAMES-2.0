import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFile,mkdir} from 'node:fs/promises'
import {join} from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'

const output=join(process.cwd(),'.distribution/developer-ux');await mkdir(output,{recursive:true})
const now=Date.now(),date=days=>new Date(now-days*86400000).toISOString()
const games=[{id:'11111111-1111-4111-8111-111111111111',title:'Les îles d’azur',isPublished:true,activeVersionId:'v1',externalRevisionId:null,recordedViews:1584,favorites:42,reviews:18,buildCount:2,revisionCount:0,draftState:'submitted',correctionRequired:false},{id:'22222222-2222-4222-8222-222222222222',title:'Orbital Echo',isPublished:false,activeVersionId:null,externalRevisionId:null,recordedViews:0,favorites:0,reviews:0,buildCount:1,revisionCount:0,draftState:'submitted',correctionRequired:true},{id:'33333333-3333-4333-8333-333333333333',title:'Le jardin des possibles',isPublished:false,activeVersionId:null,externalRevisionId:null,recordedViews:0,favorites:0,reviews:0,buildCount:0,revisionCount:1,draftState:'draft',correctionRequired:false}]
const rows=games.slice(0,2).map((g,i)=>({id:'build-'+i,gameId:g.id,title:g.title,version:'1.0.'+i,versionId:i?null:'v1',technicalStatus:'completed',decision:i?'pending':'published',versionStatus:i?null:'published',reason:i?'Le manifeste ne déclare pas le point d’entrée local. Ajoutez client.entrypoints.local, puis envoyez une archive corrigée.':null,createdAt:date(i?2:18),editorialComplete:true,submissionId:'submission-'+i,history:[{at:date(1),action:i?'correction_requested':'publish',reason:null}]}))
rows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))
const external=[{id:'44444444-4444-4444-8444-444444444444',gameId:games[2].id,title:games[2].title,url:'https://example.test/mon-jeu/',createdAt:date(7),status:'pending',action:null,reason:null,latest:true,updateOnly:false,history:[]}]
const requests=[],browserErrors=[]
let professionalVerified=true,professionalSentAt=0,professionalChallenge=null,failProfileSave=false
let professionalProfile={firstName:'Fixture',lastName:'Studio',publicName:'Studio local',contactEmail:'professional@example.test',website:null,otherContact:null}
const professionalStatus=()=>({verified:professionalVerified,verifiedAt:professionalVerified?date(1):null,profileRequired:!professionalProfile,revision:games[0].id,retryAfter:Math.max(0,60-Math.floor((Date.now()-professionalSentAt)/1000)),challenge:professionalChallenge})
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Workspace from './components/DeveloperWorkspace';import Submissions from './components/DeveloperSubmissions';import BuildStatus from './components/BuildReviewStatus';import Resources from './app/developer/resources/page';import Profile from './app/developer/profile/page';import Navigation from './components/DeveloperNavigation';import{EmailNotice}from './components/developer/DeveloperUI';import{Navbar}from './components/Navbar';import styles from './components/developer/developer.module.css';const path=location.pathname;const view=path.endsWith('statistics')?'statistics':path.endsWith('/games')?'games':'overview';const game=path.includes('/games/')?path.split('/').at(-1):undefined;createRoot(document.getElementById('root')).render(<><div style={{fontSize:11,textAlign:'center',padding:6,color:'#9aacb8'}}>Données de démonstration · environnement local</div><Navbar/><div className={styles.shell+' '+styles.layout}><Navigation/><main className={styles.content}><div className={styles.page}><EmailNotice/>{path.endsWith('/profile')?<Profile/>:path.includes('/builds/')?<BuildStatus id='build-1'/>:path.endsWith('resources')?<Resources/>:path.endsWith('submissions')?<Submissions/>:<Workspace view={view} gameId={game}/>}</div></main></div></>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,outdir:output,platform:'browser',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-fixtures',setup(api){
 api.onResolve({filter:/^(?:@\/components\/AuthProvider|@\/lib\/supabaseClient|next\/link|next\/navigation|next\/image|next\/dynamic|@\/components\/NotificationBell)$/},args=>({path:args.path,namespace:'fixture'}))
 api.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:
 args.path==='next/dynamic'?`export default function dynamic(){return ()=>null}`:args.path==='next/link'?`import React from'react';export default function Link({prefetch,...p}){return <a {...p}/>}`:
 args.path==='next/image'?`import React from'react';export default function Image({unoptimized,priority,fill,loader,...p}){return <img {...p}/>} `:
 args.path==='next/navigation'?`export function usePathname(){return location.pathname}export function useRouter(){return {push(p){location.href=p}}}export function useSearchParams(){return new URLSearchParams(location.search)}`:
 args.path==='@/components/NotificationBell'?`export default function Bell(){return null}`:
 args.path==='@/lib/supabaseClient'?`export const supabase={auth:{signOut:async()=>({})},from(){const c={select(){return c},in(){return c},eq(){return c},abortSignal(){return c},then(r){return Promise.resolve({data:[{id:'${games[0].id}',thumbnail_url:'/cover.svg'}]}).then(r)}};return c}}`:
 `export function useAuth(){const q=new URLSearchParams(location.search),user={id:'fixture-user',email:'studio@example.test',email_confirmed_at:'${date(30)}'};return {loading:false,user:q.has('anonymous')?null:user,session:q.has('anonymous')?null:{user,access_token:q.has('other')?'other-token':'fixture-token'}}}`}))
}}]})
const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).text
const globalStyles=(await postcss([tailwind()]).process(await readFile('app/globals.css','utf8'),{from:join(process.cwd(),'app/globals.css')})).css
const respond=(res,body,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(body))}
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost')
 if(u.pathname==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(js);return}
 if(u.pathname==='/styles.css'){res.setHeader('Content-Type','text/css');res.end(globalStyles+'\n'+css);return}
 if(u.pathname==='/chibaskogames-logo-small.webp'){res.setHeader('Content-Type','image/webp');res.end(await readFile('public/chibaskogames-logo-small.webp'));return}
 if(u.pathname==='/cover.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><defs><linearGradient id="a" x2="1" y2="1"><stop stop-color="#14314b"/><stop offset="1" stop-color="#397b86"/></linearGradient></defs><path fill="url(#a)" d="M0 0h640v400H0z"/><circle cx="460" cy="90" r="45" fill="#b7e9dc"/><path d="M0 310 170 120 300 260 430 190 640 400H0" fill="#1b4759"/><path d="m80 400 200-180 160 180" fill="#377182"/><path d="m270 400 150-130 160 130" fill="#254e67"/></svg>');return}
 if(!u.pathname.startsWith('/api/')){if(u.searchParams.has('unconfirmed')){professionalVerified=false;professionalSentAt=0;professionalChallenge=null}res.end('<!doctype html><html lang="fr"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>Espace développeur — démonstration locale</title></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');return}
 requests.push({path:u.pathname,method:req.method,authorization:req.headers.authorization})
 if(req.headers.authorization==='Bearer other-token'){respond(res,{error:{code:'forbidden'}},403);return}
 if(u.pathname==='/api/developer/profile'&&req.method==='GET'){respond(res,{data:professionalProfile});return}
 if(u.pathname==='/api/developer/profile'&&req.method==='PUT'){let body='';for await(const c of req)body+=c;const next=JSON.parse(body);if(failProfileSave){failProfileSave=false;respond(res,{error:{code:'database_error'}},503);return}if(next.contactEmail.trim().toLowerCase()!==professionalProfile?.contactEmail.trim().toLowerCase()){professionalVerified=false;professionalChallenge=null}professionalProfile=next;respond(res,{data:professionalProfile});return}
 if(u.pathname==='/api/developer/profile/email'){
  if(req.method==='GET'){respond(res,{enabled:true,data:professionalStatus()});return}
  let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw)
  if(body.action==='send'){professionalSentAt=Date.now();professionalChallenge={id:body.requestId,expiresAt:new Date(Date.now()+600000).toISOString(),attemptsRemaining:5,acceptedByProvider:false};respond(res,{data:professionalStatus()},202);return}
  if(body.code!=='000123'){professionalChallenge.attemptsRemaining--;respond(res,{error:{code:'verification_invalid'}},400);return}
  professionalVerified=true;professionalChallenge=null;respond(res,{data:professionalStatus()});return
 }
 if(u.pathname==='/api/social/notifications'){respond(res,{data:{isAdmin:false,avatarUrl:null,unreadCount:0}});return}
 if(u.pathname==='/api/developer/workspace'){const id=u.searchParams.get('gameId');respond(res,{data:{games:id?games.filter(g=>g.id===id):games,builds:id?rows.filter(r=>r.gameId===id):[],external:id?external.filter(r=>r.gameId===id):[]}});return}
 if(u.pathname==='/api/developer/uploads/build-1/review'){respond(res,{data:{...rows.find(r=>r.id==='build-1'),gameId:games[1].id,attempt:1,mode:'sdk',scan:null,previewVersionId:null,onlineOnly:false,diagnostic:null}});return}
 if(u.pathname==='/api/developer/submissions'){respond(res,{data:rows});return}
 if(u.pathname==='/api/developer/submissions/external'){respond(res,{data:external});return}
 if(u.pathname==='/api/developer/drafts'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;requests.at(-1).body=JSON.parse(body);respond(res,{data:{mode:'update',gameId:games[1].id}});return}
 if(u.pathname==='/api/developer/drafts'){respond(res,{data:[]});return}
 respond(res,{error:{code:'not_found'}},404)
})
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port
const browser=await chromium.launch({channel:'chrome',headless:true})
const context=await browser.newContext();await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort())
const page=await context.newPage();page.on('pageerror',e=>browserErrors.push(e.message))
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}])for(const [name,path]of [['overview','/developer'],['games','/developer/games'],['submissions','/developer/submissions'],['statistics','/developer/statistics'],['resources','/developer/resources'],['profile','/developer/profile'],['game-detail','/developer/games/'+games[1].id],['build-diagnostic','/developer/builds/build-1']])await test(`${name}: actual Chrome at ${viewport.width}px`,async()=>{
  await page.setViewportSize(viewport);await page.goto(origin+path);await page.getByRole('heading',{level:1}).waitFor();await page.getByText('Chargement des projets…',{exact:true}).waitFor({state:'hidden'});await page.waitForTimeout(150)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal document overflow')
  assert.ok(await page.locator('nav[aria-label="Espace développeur"] a[aria-current=page]').count()||name==='game-detail'||name==='build-diagnostic')
  for(const link of await page.locator('nav[aria-label="Espace développeur"] a').all())assert.equal(await link.isVisible(),true)
  assert.doesNotMatch(await page.locator('main').innerText(),/Invalid Date|NaN|\d{4}-\d{2}-\d{2}T\d{2}:/)
  await page.screenshot({path:join(output,`${name}-${viewport.width}.png`),fullPage:true})
 })
 await test('account dropdown and mobile account section hold the developer entry',async()=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto(origin+'/developer');await page.getByRole('button',{name:'Mon compte',exact:true}).click();await page.getByRole('navigation',{name:'Menu du compte'}).getByRole('link',{name:'ESPACE DÉVELOPPEUR'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Mon compte',exact:true}).getAttribute('aria-expanded'),'false')
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Ouvrir le menu'}).click();const mobile=page.locator('#navigation-mobile');await mobile.getByRole('link',{name:'Espace développeur'}).waitFor();assert.equal(await mobile.locator('a[href="/developer"]').count(),1);await page.keyboard.press('Escape')
 })
 await test('library search and statistics period never invent audience history',async()=>{
  await page.goto(origin+'/developer/games');await page.getByLabel('Rechercher un jeu').fill('Orbital');assert.equal(await page.locator('main article').count(),1)
  await page.goto(origin+'/developer/statistics');await page.getByLabel('Période des dépôts').selectOption('7');await page.getByRole('list',{name:'Dépôts par mois'}).waitFor();assert.match(await page.locator('main').innerText(),/Totaux actuels · hors filtre de période/);await page.getByLabel('Jeu',{exact:true}).selectOption(games[1].id);assert.match(await page.locator('main').innerText(),/1 dépôt sur la période/)
 })
 await test('correction needs confirmation and keeps the exact game and original build',async()=>{
  await page.goto(origin+'/developer/games/'+games[1].id);const button=page.getByRole('button',{name:'Remplacer par un build corrigé'});await button.waitFor();let count=requests.filter(r=>r.method==='POST').length
  page.once('dialog',d=>d.dismiss());await button.click();assert.equal(requests.filter(r=>r.method==='POST').length,count)
  page.once('dialog',d=>d.accept());await button.click();await page.waitForURL('**/publier-un-jeu?mode=update&game='+games[1].id);const req=requests.filter(r=>r.method==='POST').at(-1);assert.deepEqual(req.body,{action:'prepare-correction',gameId:games[1].id,uploadId:'build-1'})
 })
 await test('anonymous, denied and unconfirmed sessions have explicit safe states',async()=>{
  let before=requests.length;await page.goto(origin+'/developer?anonymous');await page.getByText('Connectez-vous ou créez un compte pour effectuer cette action.').waitFor();assert.ok(!requests.slice(before).some(r=>r.path==='/api/developer/workspace'))
  await page.goto(origin+'/developer/games?other');await page.getByRole('alert').waitFor();assert.ok(!(await page.locator('main').innerText()).includes('Les îles d’azur'))
  await page.goto(origin+'/developer?unconfirmed');await page.getByLabel('Adresse professionnelle du développeur').waitFor();await page.screenshot({path:join(output,'unconfirmed-mobile.png'),fullPage:true})
 })
 await test('external submission is readable and does not start an iframe implicitly',async()=>{
  await page.goto(origin+'/developer/submissions');await page.getByRole('button',{name:'Révisions URL · Externe'}).click();await page.getByText('Le jardin des possibles',{exact:true}).waitFor();assert.equal(await page.locator('iframe').count(),0);await page.screenshot({path:join(output,'external-submissions-mobile.png'),fullPage:true})
 })
 await test('a long unbroken game title fits a mobile management page',async()=>{
  const saved=games[0].title;games[0].title='Projet'+''.padStart(154,'x')
  try{await page.setViewportSize({width:390,height:844});await page.goto(origin+'/developer/games/'+games[0].id);await page.getByRole('heading',{name:games[0].title,exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}finally{games[0].title=saved}
 })
 await test('professional email profile is independent of Auth; code, wrong attempt and email change are explicit',async()=>{
  await page.goto(origin+'/developer/profile?unconfirmed');await page.getByLabel('Adresse professionnelle du développeur').waitFor();await page.getByRole('button',{name:'Recevoir un code de vérification',exact:true}).click()
  const input=page.getByLabel('Code à six chiffres',{exact:true});await input.fill('000000');await page.getByRole('button',{name:'Confirmer mon adresse',exact:true}).click();await page.getByText('Ce code est incorrect ou n’est plus utilisable.').waitFor()
  assert.equal(await page.getByRole('button',{name:/Renvoyer dans/}).isDisabled(),true)
  await input.fill('000123');await page.getByRole('button',{name:'Confirmer mon adresse',exact:true}).click();await page.getByText(/^Adresse professionnelle vérifiée le /).waitFor();await page.getByLabel('Adresse professionnelle du développeur').waitFor({state:'hidden'})
  await page.goto(origin+'/developer/profile');await page.getByRole('button',{name:'Modifier',exact:true}).click();await page.getByLabel('E-mail de contact',{exact:true}).fill('changed-professional@example.test');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByText('Fiche développeur enregistrée.',{exact:true}).waitFor();await page.getByLabel('Adresse professionnelle du développeur').waitFor();assert.equal(professionalVerified,false)
  await page.screenshot({path:join(output,'professional-email-mobile.png'),fullPage:true})
 })

 await test('profile is read-only; cancel, errors and non-email changes preserve verification on desktop and mobile',async()=>{
  professionalVerified=true;professionalSentAt=0;professionalChallenge=null
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.goto(origin+'/developer/profile');await page.getByRole('button',{name:'Modifier',exact:true}).waitFor();await page.getByText(/^Adresse professionnelle vérifiée le /).waitFor()
   assert.equal(await page.getByLabel('Prénom',{exact:true}).count(),0)
   await page.screenshot({path:join(output,'profile-readonly-'+width+'.png'),fullPage:true})
   await page.getByRole('button',{name:'Modifier',exact:true}).click();await page.getByLabel('Prénom',{exact:true}).fill('À annuler');await page.getByRole('button',{name:'Annuler',exact:true}).click();assert.notEqual(professionalProfile.firstName,'À annuler');assert.equal(await page.getByRole('button',{name:'Modifier',exact:true}).evaluate(e=>e===document.activeElement),true)
   await page.getByRole('button',{name:'Modifier',exact:true}).click();await page.getByLabel('Prénom',{exact:true}).fill('Élodie');failProfileSave=true;await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByRole('alert').filter({hasText:'Impossible d’enregistrer'}).waitFor();assert.equal(await page.getByLabel('Prénom',{exact:true}).inputValue(),'Élodie')
   await page.getByLabel('E-mail de contact',{exact:true}).fill(professionalProfile.contactEmail.toUpperCase());await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByRole('button',{name:'Modifier',exact:true}).waitFor();assert.equal(professionalVerified,true);await page.getByText(/^Adresse professionnelle vérifiée le /).waitFor()
   await page.getByRole('button',{name:'Modifier',exact:true}).click();await page.getByLabel('E-mail de contact',{exact:true}).fill('new-'+width+'@example.test');await page.getByText('Nouvelle vérification nécessaire',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
   await page.screenshot({path:join(output,'profile-edit-'+width+'.png'),fullPage:true})
   const original=professionalProfile.contactEmail;page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Enregistrer',exact:true}).click();assert.equal(professionalProfile.contactEmail,original);assert.equal(professionalVerified,true);await page.getByRole('button',{name:'Annuler',exact:true}).click()
  }
 })
 await test('new developer creates one profile; cancel never writes or sends a code',async()=>{
  professionalProfile=null;professionalVerified=false;professionalSentAt=0;professionalChallenge=null
  await page.goto(origin+'/developer/profile');await page.getByLabel('Prénom',{exact:true}).waitFor();await page.getByRole('button',{name:'Annuler',exact:true}).click();assert.equal(professionalProfile,null)
  await page.getByRole('button',{name:'Créer ma fiche développeur',exact:true}).click();await page.getByLabel('Prénom',{exact:true}).fill('Nouveau');await page.getByLabel('Nom',{exact:true}).fill('Créateur');await page.getByLabel('E-mail de contact',{exact:true}).fill('new-studio@example.test');await page.getByLabel('Nom public / studio',{exact:true}).fill('Nouveau studio');await page.getByRole('button',{name:'Enregistrer',exact:true}).click();await page.getByRole('button',{name:'Modifier',exact:true}).waitFor();await page.getByRole('button',{name:'Recevoir un code de vérification',exact:true}).waitFor();assert.equal(professionalProfile.publicName,'Nouveau studio');assert.equal(professionalVerified,false);assert.equal(professionalSentAt,0)
  await page.screenshot({path:join(output,'profile-new-mobile.png'),fullPage:true})
 })
 assert.deepEqual(browserErrors,[])
 console.log('Local screenshots (fictional fixtures): '+output)
}finally{await browser.close();await new Promise(r=>server.close(r))}

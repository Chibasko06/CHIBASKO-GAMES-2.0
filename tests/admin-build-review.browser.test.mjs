import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFile,readdir,mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const id='56565656-5656-4656-8656-565656565656',game='54545454-5454-4454-8454-545454545454'
const initial=()=>({id,gameId:game,game:'Fixture game',developer:'Fixture developer',description:'Description',version:'1.0.0',createdAt:'2026-10-20T10:00:00Z',updatedAt:'2026-10-20T10:00:00Z',archiveSize:123456,technicalStatus:'queued',errorCode:null,attempts:0,gameVersionId:null,versionStatus:null,manifest:null,validatedAt:null,publishedAt:null,active:false,review:{decision:'pending',checklist:{},reviewedAt:null,reason:null,submissionId:game},submission:{id:game,title:'Proposed fixture title',developer:'Studio fixture',description:'Editorial description',status:'pending',kind:'new',releaseDate:'2026-10-20',technology:'HTML/JS',mobile:'Oui',categories:['Arcade'],cover:'/cover.svg'},history:[]})
let row=initial(),actions=[],legacyCalls=0,styles=''
if(process.env.ADMIN_REVIEW_VISUAL==='1'){
 const root=join(process.cwd(),'.next/static');const files=(await readdir(root,{recursive:true})).filter(file=>file.endsWith('.css'))
 styles=(await Promise.all(files.map(file=>readFile(join(root,file),'utf8')))).join('\n');assert.ok(styles)
}
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Reviews from './components/admin/BuildReviews';createRoot(document.getElementById('root')).render(<Reviews id={location.pathname==='/list'?undefined:'${id}'}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(api){
 api.onResolve({filter:/^(?:next\/link|next\/image|next\/dynamic|next\/navigation|@\/components\/AuthProvider|@\/components\/game-runtime\/GameRuntime)$/},args=>({path:args.path,namespace:'fixture'}))
 api.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/navigation'?`export function useRouter(){return {push(path){location.href=path}}}`:args.path==='next/link'?`import React from 'react';export default function Link(props){return <a {...props}/>}`:args.path==='next/image'?`import React from 'react';export default function Image({unoptimized,...props}){return <img {...props}/>} `:args.path==='@/components/AuthProvider'?`export function useAuth(){return {session:{user:{id:'fixture-admin'},access_token:'fixture-token'}}}`:`import React from 'react';export default function dynamic(){return function Runtime(props){return <p role="status" data-execution={props.execution}>Jeu de test chargé</p>}}`}))
}}]})
const server=createServer(async(request,response)=>{
 const url=new URL(request.url,'http://fixture');const json=body=>{response.setHeader('Content-Type','application/json');response.end(JSON.stringify(body))}
 if(url.pathname==='/bundle.js'){response.setHeader('Content-Type','application/javascript');response.end(bundle.outputFiles[0].contents);return}
 if(url.pathname==='/style.css'){response.setHeader('Content-Type','text/css');response.end(styles);return}
 if(url.pathname==='/cover.svg'){response.setHeader('Content-Type','image/svg+xml');response.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#164e63"/><text x="40" y="190" fill="white" font-size="40">Fixture cover</text></svg>');return}
 if(url.pathname.startsWith('/api/')){
  assert.equal(request.headers.authorization,'Bearer fixture-token')
  if(url.pathname==='/api/admin/game-submissions'){legacyCalls++;json({submissions:[{id:game,game_title:'Historical fixture',name_or_studio:'Old studio',status:'pending',email:'fixture@example.test',description:'Legacy',category_names:[],updated_at:'2026-10-20',build_upload_id:null},{...row.submission,build_upload_id:id,game_title:'Linked editorial entry'}]});return}
  if(request.method==='GET'){json({data:url.pathname.endsWith('/'+id)?row:[row]});return}
  const chunks=[];for await(const chunk of request)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));actions.push(body)
  if(body.action==='review'){row.review={...row.review,decision:'reviewed',checklist:body.checklist,reviewedAt:'2026-10-20T11:00:00Z'};row.versionStatus='in_review'}
  if(body.action==='publish'){row.versionStatus='published';row.review.decision='published'}
  if(body.action==='reject'||body.action==='archive'){row.review.decision=body.action==='reject'?'rejected':'archived';row.review.reason=body.reason}
  json({data:row});return
 }
 response.end('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><body style="background:#09090b"><div id="root"></div><script src="/bundle.js"></script></body></html>')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port
let browser
try{
 browser=await chromium.launch({channel:'chrome',headless:true})
 await test('Chrome review: queued build presents four actions; UUIDs and commands remain collapsed',async()=>{
  row=initial();actions=[];const page=await browser.newPage();await page.goto(origin)
  await page.getByRole('heading',{name:'Proposed fixture title',exact:true}).waitFor()
  for(const title of ['Informations proposées','1. Vérification technique','2. Tester le jeu','3. Revue','4. Décision'])await page.getByRole('heading',{name:title,exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:'Publier',exact:true}).isDisabled(),true)
  assert.equal(await page.getByLabel('Motif du refus',{exact:false}).count(),0)
  const text=await page.locator('body').innerText();assert.ok(!text.includes(id));assert.ok(!text.includes(game));assert.ok(!text.includes('npm run'));assert.ok(!text.includes('credentials'))
  await page.getByText('Voir les instructions de vérification',{exact:true}).click()
  await page.getByText('Cette vérification doit actuellement être lancée depuis le poste d’administration.',{exact:true}).waitFor()
  assert.ok(!(await page.locator('body').innerText()).includes('npm run'))
  await page.getByText('Mode avancé / Instructions techniques',{exact:true}).click();assert.match(await page.locator('body').innerText(),/npm run review:game/)
  await page.getByText('Détails techniques',{exact:true}).click();assert.ok((await page.locator('body').innerText()).includes(id))
  await page.close()
 })
 await test('Chrome review: test, checklist, persisted review, publication and mobile layout',async()=>{
  row={...initial(),technicalStatus:'completed',versionStatus:'draft',gameVersionId:game,manifest:{capabilities:{local:{players:{min:1,max:4}}}}};actions=[]
  const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto(origin)
  await page.getByRole('button',{name:'Lancer le jeu de test',exact:true}).click();await page.getByText('Jeu de test chargé',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Fermer le test'}).click();assert.equal(await page.getByText('Jeu de test chargé',{exact:true}).count(),0)
  for(const label of ['Jeu lancé et fonctionnel','Contenu vérifié','Informations et description correctes','Aucun comportement suspect'])await page.getByRole('checkbox',{name:label,exact:true}).check()
  await page.getByText('Revue complète',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Publier',exact:true}).isDisabled(),true)
  await page.getByRole('button',{name:'Enregistrer la revue',exact:true}).click();await page.getByText('Prêt à publier',{exact:true}).waitFor()
  await page.getByRole('checkbox',{name:'Contenu vérifié',exact:true}).uncheck();assert.equal(await page.getByRole('button',{name:'Publier',exact:true}).isDisabled(),true)
  await page.getByRole('checkbox',{name:'Contenu vérifié',exact:true}).check()
  if(styles){const directory=await mkdtemp(join(tmpdir(),'chibasko-admin-review-'));await page.screenshot({path:join(directory,'review-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:join(directory,'review-mobile.png'),fullPage:true});console.log('Admin review visual fixtures:',directory)}
  await page.getByRole('button',{name:'Publier',exact:true}).click();await page.getByText('Publié',{exact:true}).waitFor();assert.deepEqual(actions.map(action=>action.action),['review','publish'])
  assert.equal(await page.getByRole('button',{name:'Publier',exact:true}).isDisabled(),true);await page.close()
 })
 await test('Chrome review: explicit rejection reason and historical proposals share the publications area',async()=>{
  row=initial();actions=[];const page=await browser.newPage();await page.goto(origin)
  await page.getByRole('button',{name:'Refuser',exact:true}).click();const reason=page.getByLabel('Motif du refus',{exact:false});await reason.waitFor()
  assert.equal(await page.getByRole('button',{name:'Confirmer le refus'}).isDisabled(),true)
  await reason.fill('Contenu incompatible avec le catalogue.');await page.getByRole('button',{name:'Confirmer le refus'}).click();await page.getByText('Refusé',{exact:true}).waitFor()
  assert.equal(actions[0].reason,'Contenu incompatible avec le catalogue.')
  await page.getByRole('button',{name:'Archiver',exact:true}).click();await page.getByLabel('Motif de l’archivage',{exact:false}).fill('Dossier clos.')
  await page.getByRole('button',{name:'Confirmer l’archivage',exact:true}).click();await page.getByText('Archivé',{exact:true}).waitFor();assert.equal(actions[1].action,'archive')
  await page.goto(origin+'/list');await page.getByRole('heading',{name:'Soumissions',exact:true}).waitFor();assert.equal(legacyCalls,0)
  await page.getByText('Archives — propositions sans build',{exact:true}).click();await page.getByText('Historical fixture · En attente',{exact:true}).waitFor()
  assert.ok(!(await page.locator('body').innerText()).includes('Linked editorial entry'));assert.equal(legacyCalls,1);await page.close()
 })
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}

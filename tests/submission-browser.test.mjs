import test from 'node:test'
import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {readFile,readdir,mkdtemp} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
const game='54545454-5454-4454-8454-545454545454',upload='56565656-5656-4656-8656-565656565656'
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Submit from './components/SubmitGamePageClient';createRoot(document.getElementById('root')).render(<Submit categories={[{id:'${game}',name:'Fixture category',slug:'fixture'}]}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,platform:'browser',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'fixtures',setup(api){
 api.onResolve({filter:/^(?:@\/components\/AuthProvider|next\/link)$/},args=>({path:args.path,namespace:'fixture'}))
 api.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'?`import React from 'react';export default function Link(props){return <a {...props}/>}`:`export function useAuth(){return {loading:false,session:new URLSearchParams(location.search).has('anonymous')?null:{user:{id:new URLSearchParams(location.search).has('other')?'other-user':'fixture-user'},access_token:new URLSearchParams(location.search).has('other')?'other-token':'fixture-token'}}}`}))
}}]})
let contact={firstName:'Fixture',lastName:'Developer',contactEmail:'contact@example.test',publicName:'Studio fixture',website:null,otherContact:null}
let publishedParts=0,submissions=[],requests=[],draft=null,registrations=0,failPart=false,uploadFailure=''
const freshDraft=title=>({gameId:game,title,metadata:{title,studio:'',releaseDate:'',description:'',categories:[],mobile:null,technology:''},version:'',revision:0,updatedAt:'2026-10-20T10:00:00Z',requestId:'57575757-5757-4757-8757-575757575757',file:null,hashes:{},submitted:false,coverUrl:null,state:'draft',upload:null})
let styles=''
if(process.env.SUBMISSION_VISUAL_CHECK==='1'){
 const directory=join(process.cwd(),'.next/static/css')
 const names=(await readdir(directory)).filter(name=>name.endsWith('.css'))
 styles=(await Promise.all(names.map(name=>readFile(join(directory,name),'utf8')))).join('\n')
 assert.ok(styles,'Build Next.js before the visual check')
}
const json=(response,body)=>{response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(body))}
const storage=createServer((request,response)=>{if(request.method==='OPTIONS'){
 response.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'PUT','Access-Control-Allow-Headers':'content-type'});response.end();return
}if(failPart){failPart=false;response.writeHead(503,{'Access-Control-Allow-Origin':'*'});request.resume();response.end();return}publishedParts++;response.writeHead(200,{'Access-Control-Allow-Origin':'*'});request.resume();request.on('end',()=>response.end())})
await new Promise(resolve=>storage.listen(0,'127.0.0.1',resolve))
const storageOrigin='http://127.0.0.1:'+storage.address().port
const server=createServer(async(request,response)=>{
 try{
 const url=new URL(request.url,'http://fixture')
 if(url.pathname==='/styles.css'){response.writeHead(200,{'Content-Type':'text/css'});response.end(styles);return}
 if(url.pathname==='/bundle.js'){response.writeHead(200,{'Content-Type':'application/javascript'});response.end(bundle.outputFiles[0].contents);return}
 if(!url.pathname.startsWith('/api/')){response.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/bundle.js"></script>');return}
 requests.push(url.pathname)
 assert.ok(['Bearer fixture-token','Bearer other-token'].includes(request.headers.authorization))
 if(url.pathname==='/api/developer/profile'&&request.method==='GET'){json(response,{data:request.headers.authorization==='Bearer fixture-token'?contact:null});return}
 if(url.pathname==='/api/developer/drafts'&&request.method==='GET'){
  const owned=request.headers.authorization==='Bearer fixture-token'?draft:null
  if(url.searchParams.has('gameId')&&(!owned||url.searchParams.get('gameId')!==game)){response.writeHead(404,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'draft_not_found'}}));return}
  json(response,{data:url.searchParams.has('gameId')?owned:owned?[owned]:[],maxArchiveBytes:524288000});return
 }
 if(url.pathname==='/api/developer/games'&&request.method==='GET'){json(response,{data:[{id:game,title:'Managed fixture'}],maxArchiveBytes:524288000});return}
 const chunks=[];for await(const chunk of request)chunks.push(chunk)
 const bytes=Buffer.concat(chunks)
 if(url.pathname==='/api/developer/profile'&&request.method==='PUT'){contact=JSON.parse(bytes);json(response,{data:contact});return}
 if(url.pathname==='/api/developer/drafts'){
  const body=JSON.parse(bytes)
  if(body.action==='save'){draft.metadata=body.metadata;draft.title=body.metadata.title;draft.version=body.version;draft.revision++}
  if(body.action==='upload-state'){draft.file=body.file;draft.hashes={...draft.hashes,...body.hashes}}
  json(response,{data:draft});return
 }
 if(url.pathname==='/api/developer/games'){
   if(request.headers.referer?.includes('registration-error=1')){response.writeHead(503,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'service_unavailable'}}));return}
   registrations++;draft=freshDraft(JSON.parse(bytes).title);json(response,{data:{gameId:game}});return
 }
 if(url.pathname.endsWith('/uploads')){if(uploadFailure){response.writeHead(400,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:uploadFailure}}));return}if(draft){draft.upload={id:upload,status:'uploading',version:draft.version,archiveSize:8,expiresAt:'2099-01-01T00:00:00Z',partSize:33554432};draft.state='uploading'}json(response,{data:{id:upload,status:'uploading',upload:{partSize:33554432}}});return}
 if(url.pathname==='/api/developer/uploads/'+upload){json(response,{data:{id:upload,status:draft?.upload?.status??'uploading',upload:{partSize:33554432}}});return}
 if(url.pathname.endsWith('/parts')){json(response,{data:{parts:request.method==='POST'?[{url:storageOrigin+'/part',headers:{'Content-Length':'8'}}]:[]}});return}
 if(url.pathname.endsWith('/finalize')){if(draft?.upload)draft.upload.status='queued';json(response,{data:{id:upload,status:'queued'}});return}
 if(url.pathname==='/api/developer/submissions'){
   if(request.headers['content-type']?.startsWith('application/json')){submissions.push({body:JSON.parse(bytes),cover:null});json(response,{data:{submissionId:game}});return}
   const form=await new Request('http://fixture',{method:'POST',headers:request.headers,body:bytes}).formData()
   submissions.push({body:JSON.parse(form.get('metadata')),cover:form.get('cover')?.type??null});if(draft&&submissions.at(-1).body.kind==='new')draft.submitted=true
   json(response,{data:{submissionId:game}});return
 }
 response.writeHead(404);response.end()
 }catch{response.writeHead(500);response.end('fixture error')}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const origin='http://127.0.0.1:'+server.address().port
let browser
try{
 browser=await chromium.launch({channel:'chrome',headless:true})
 await test('Chrome: upload errors stay beside their fields/actions and corrections clear them',async()=>{
  draft=null;const page=await browser.newPage();await page.goto(origin)
  await page.getByRole('tab',{name:'Mettre à jour un jeu existant'}).click()
  await page.getByLabel('Jeu géré',{exact:true}).selectOption(game)
  const version=page.getByLabel('Version du build (SemVer)',{exact:true}),zip=page.locator('input[accept=".zip,application/zip"]')
  await version.fill('0.3.1');await zip.setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:Buffer.from('abcdefgh')})
  await page.getByRole('checkbox',{name:'Je dispose des droits nécessaires',exact:false}).check()
  for(const code of ['invalid_version','version_conflict','invalid_archive_size','storage_error','developer_profile_required']){
   uploadFailure=code
   await page.getByRole('button',{name:/Envoyer le build|Reprendre et finaliser/}).click()
   const alert=page.getByRole('alert');await alert.waitFor()
   if(code==='invalid_version'||code==='version_conflict'){
    assert.equal(await version.getAttribute('aria-describedby'),'update-error')
    assert.equal(await version.getAttribute('aria-invalid'),'true')
    if(code==='version_conflict')assert.match(await alert.innerText(),/0\.3\.1/)
    await version.fill('0.3.2');await alert.waitFor({state:'detached'});await version.fill('0.3.1')
   }else if(code==='invalid_archive_size'){
    assert.equal(await zip.getAttribute('aria-invalid'),'true');await zip.setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:Buffer.from('abcdefgh')});await alert.waitFor({state:'detached'})
   }else if(code==='developer_profile_required'){
    assert.equal(await page.locator('#developer-contact-errors [role=alert]').count(),1)
    await zip.setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:Buffer.from('abcdefgh')});await alert.waitFor({state:'detached'})
   }else{
    const bounds=await alert.boundingBox(),button=await page.getByRole('button',{name:'Reprendre et finaliser'}).boundingBox()
    assert.ok(bounds.y+ bounds.height<=button.y);await zip.setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:Buffer.from('abcdefgh')});await alert.waitFor({state:'detached'})
   }
  }
  uploadFailure='';await page.close()
 })
 await test('Chrome: contact is required, saved once, restored and editable independently of drafts',async()=>{
  contact=null;const page=await browser.newPage();await page.goto(origin)
  await page.getByLabel('Prénom',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Créer le jeu privé et obtenir son gameId',exact:true}).isDisabled(),true)
  await page.getByLabel('Prénom',{exact:true}).fill('Fixture');await page.getByLabel('Nom',{exact:true}).fill('Developer');await page.getByLabel('E-mail de contact',{exact:true}).fill('contact@example.test');await page.getByLabel('Nom public / studio',{exact:true}).fill('Studio fixture')
  await page.getByRole('button',{name:'Enregistrer la fiche développeur'}).click();await page.getByText('Fiche développeur enregistrée.',{exact:true}).waitFor()
  await page.reload();await page.waitForFunction(()=>document.querySelector('input[type=email]')?.value==='contact@example.test')
  assert.equal(await page.getByLabel('Prénom',{exact:true}).inputValue(),'Fixture')
  await page.getByLabel('Prénom',{exact:true}).fill('Edited');await page.getByRole('button',{name:'Enregistrer la fiche développeur'}).click();await page.getByText('Fiche développeur enregistrée.',{exact:true}).waitFor();assert.equal(contact.firstName,'Edited')
  await page.close()
 })
 await test('Chrome: anonymous sees no private identity; tabs isolate new metadata and managed update picker',async()=>{
   draft=null;const page=await browser.newPage();await page.goto(origin+'/?anonymous=1')
   await page.getByText('Un compte est nécessaire',{exact:false}).waitFor()
   assert.equal(await page.locator('input[type=file]').count(),0)
   assert.ok(!(await page.locator('body').innerText()).includes(game))
   await page.goto(origin)
   await page.getByRole('tab',{name:'Publier un nouveau jeu',exact:true}).waitFor()
   assert.equal(await page.getByLabel('Jeu géré',{exact:true}).count(),0)
   await page.getByRole('tab',{name:'Mettre à jour un jeu existant',exact:true}).click()
   await page.getByLabel('Jeu géré',{exact:true}).waitFor()
   assert.equal(await page.getByLabel('Développeur / studio',{exact:true}).count(),0)
   await page.getByLabel('Jeu géré',{exact:true}).selectOption(game)
   await page.getByLabel('Version du build (SemVer)',{exact:true}).fill('1.1.0')
   await page.locator('input[accept=".zip,application/zip"]').setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:Buffer.from('abcdefgh')})
   await page.getByRole('checkbox',{name:'Je dispose des droits nécessaires',exact:false}).check()
   await page.getByRole('button',{name:'Envoyer le build',exact:true}).click()
   await page.getByRole('heading',{name:'Jeu reçu — vérification sous 24 à 48 h'}).waitFor()
   assert.equal(submissions.at(-1).body.kind,'update');assert.deepEqual(submissions.at(-1).body.metadata,{})
   assert.equal(submissions.at(-1).cover,null);assert.ok(publishedParts>0)
   await page.close()
 })
 await test('Chrome: new game reserves private identity, sends editorial metadata and actual image with separate direct ZIP PUT',async()=>{
   draft=null;const page=await browser.newPage();await page.goto(origin)
   await page.getByLabel('Titre',{exact:true}).fill('New fixture')
   await page.getByRole('button',{name:'Créer le jeu privé et obtenir son gameId'}).click()
   await page.getByText('gameId privé du jeu :',{exact:false}).waitFor()
   await page.getByLabel('Développeur / studio',{exact:true}).fill('Fixture studio')
   await page.getByLabel('Date de sortie',{exact:true}).fill('2026-10-20')
   await page.getByLabel('Description',{exact:true}).fill('Fixture description')
   await page.getByRole('checkbox',{name:'Fixture category',exact:true}).check()
   await page.getByLabel('Compatible mobile',{exact:true}).selectOption('yes')
   await page.getByLabel('Technologie',{exact:true}).fill('Godot Web')
   await page.locator('input[accept^="image/jpeg"]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('fixture-image')})
   await page.getByLabel('Version du build (SemVer)',{exact:true}).fill('1.0.0')
   await page.locator('input[accept=".zip,application/zip"]').setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:Buffer.from('abcdefgh')})
   await page.getByRole('checkbox',{name:'Je dispose des droits nécessaires',exact:false}).check()
   await page.getByRole('button',{name:'Envoyer le build',exact:true}).click()
   await page.getByRole('heading',{name:'Jeu reçu — vérification sous 24 à 48 h'}).waitFor()
   const submitted=submissions.at(-1)
   assert.equal(submitted.body.kind,'new');assert.equal(submitted.body.metadata.studio,'Fixture studio')
   assert.equal(submitted.body.metadata.mobile,true);assert.equal(submitted.cover,'image/png')
   assert.ok(!requests.some(path=>path.includes('/publish')))
   await page.close()
 })
 await test('Chrome: saved new publication survives reload and another browser session; resume is private and preserves multipart identity',async()=>{
   draft=null;const before=registrations
   let page=await browser.newPage();await page.goto(origin)
   await page.getByText('Aucune publication en cours sur cette page.',{exact:true}).waitFor()
   await page.getByLabel('Titre',{exact:true}).fill('Persistent fixture')
   await page.getByRole('button',{name:'Créer le jeu privé et obtenir son gameId'}).click()
   await page.getByLabel('Développeur / studio',{exact:true}).fill('Persistent studio')
   await page.getByLabel('Version du build (SemVer)',{exact:true}).fill('0.3.0')
   await page.getByText('Brouillon enregistré',{exact:true}).waitFor()
   assert.equal(draft.metadata.studio,'Persistent studio');assert.equal(draft.version,'0.3.0')
   assert.equal(await page.getByLabel('Site développeur',{exact:false}).count(),0)
   await page.reload();await page.getByLabel('Développeur / studio',{exact:true}).waitFor()
   assert.equal(await page.getByLabel('Développeur / studio',{exact:true}).inputValue(),'Persistent studio')
   assert.equal(await page.getByLabel('Version du build (SemVer)',{exact:true}).inputValue(),'0.3.0')
   await page.getByRole('button',{name:'Retour aux publications en cours'}).click()
   await page.getByRole('button',{name:'Reprendre',exact:true}).click()
   assert.equal(registrations,before+1)
   await page.getByLabel('Date de sortie',{exact:true}).fill('2026-10-20')
   await page.getByLabel('Description',{exact:true}).fill('Long lived draft')
   await page.getByRole('checkbox',{name:'Fixture category',exact:true}).check()
   await page.getByLabel('Compatible mobile',{exact:true}).selectOption('no')
   await page.getByLabel('Technologie',{exact:true}).fill('HTML/JS')
   await page.locator('input[accept^="image/jpeg"]').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from('fixture-image')})
   await page.locator('input[accept=".zip,application/zip"]').setInputFiles({name:'fixture.zip',mimeType:'application/zip',buffer:Buffer.from('abcdefgh')})
   await page.getByRole('checkbox',{name:'Je dispose des droits nécessaires',exact:false}).check()
   failPart=true;await page.getByRole('button',{name:'Envoyer le build',exact:true}).click()
   await page.getByRole('alert').waitFor();assert.equal(draft.upload.id,upload)
   await page.close()
   page=await browser.newPage();await page.goto(origin)
   await page.getByRole('button',{name:'Reprendre',exact:true}).click()
   await page.getByText('Resélectionnez le même fichier ZIP pour reprendre l’envoi.',{exact:false}).waitFor()
   assert.equal(await page.locator('input[accept=".zip,application/zip"]').evaluate(input=>input.files.length),0)
   assert.equal(await page.locator('input[accept^="image/jpeg"]').evaluate(input=>input.files.length),0)
   assert.equal(await page.getByLabel('Développeur / studio',{exact:true}).inputValue(),'Persistent studio')
   assert.equal(await page.getByLabel('Version du build (SemVer)',{exact:true}).isDisabled(),true)
   const stranger=await browser.newPage();await stranger.goto(origin+'/?other=1')
   await stranger.getByText('Aucune publication en cours sur cette page.',{exact:true}).waitFor()
   await stranger.goto(origin+'/?other=1&draft='+game)
   await stranger.getByText('Brouillon introuvable ou accès refusé.',{exact:true}).waitFor()
   assert.equal(await stranger.getByRole('button',{name:'Copier le gameId'}).count(),0)
   await stranger.close();await page.close();assert.equal(registrations,before+1)
 })
 await test('Chrome: registration errors are focused, identity can be copied, and notices fit mobile',async()=>{
   const page=await browser.newPage({viewport:{width:1280,height:900}})
   await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin})
   draft=null;await page.goto(origin+'/?registration-error=1')
   await page.getByLabel('Titre',{exact:true}).fill('Fixture registration failure')
   await page.getByRole('button',{name:'Créer le jeu privé et obtenir son gameId'}).click()
   const alert=page.getByRole('alert');await alert.waitFor()
   assert.match(await alert.innerText(),/Le dépôt est temporairement indisponible/)
   assert.equal(await page.locator(':focus').getAttribute('role'),'alert')
   let screenshots
   if(styles){
     assert.notEqual(await alert.evaluate(node=>getComputedStyle(node).borderTopColor),'rgba(0, 0, 0, 0)')
     screenshots=await mkdtemp(join(tmpdir(),'chibasko-submission-feedback-'))
     await page.screenshot({path:join(screenshots,'error-desktop.png'),fullPage:true})
   }
   await page.goto(origin)
   await page.getByLabel('Titre',{exact:true}).fill('Fixture copied identity')
   await page.getByRole('button',{name:'Créer le jeu privé et obtenir son gameId'}).click()
   await page.getByRole('heading',{name:'Identité privée du jeu créée'}).waitFor()
   await page.getByRole('button',{name:'Copier le gameId'}).click()
   await page.getByText('gameId copié dans le presse-papiers.',{exact:true}).waitFor()
   assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),game)
   await page.setViewportSize({width:390,height:844})
   await page.getByRole('button',{name:'Copier le gameId'}).scrollIntoViewIfNeeded()
   if(styles){
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
     await page.getByRole('heading',{name:'Identité privée du jeu créée'}).locator('xpath=ancestor::section[1]').screenshot({path:join(screenshots,'identity-mobile.png')})
     console.log('Feedback visual fixtures:',screenshots)
   }
   await page.close()
 })
}finally{await browser?.close();await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>storage.close(r))])}

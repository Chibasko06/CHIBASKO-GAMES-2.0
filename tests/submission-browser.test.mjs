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
 api.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'jsx',resolveDir:process.cwd(),contents:args.path==='next/link'?`import React from 'react';export default function Link(props){return <a {...props}/>}`:`export function useAuth(){return {loading:false,session:new URLSearchParams(location.search).has('anonymous')?null:{user:{id:'fixture-user'},access_token:'fixture-token'}}}`}))
}}]})
let publishedParts=0,submissions=[],requests=[]
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
}publishedParts++;response.writeHead(200,{'Access-Control-Allow-Origin':'*'});request.resume();request.on('end',()=>response.end())})
await new Promise(resolve=>storage.listen(0,'127.0.0.1',resolve))
const storageOrigin='http://127.0.0.1:'+storage.address().port
const server=createServer(async(request,response)=>{
 try{
 const url=new URL(request.url,'http://fixture')
 if(url.pathname==='/styles.css'){response.writeHead(200,{'Content-Type':'text/css'});response.end(styles);return}
 if(url.pathname==='/bundle.js'){response.writeHead(200,{'Content-Type':'application/javascript'});response.end(bundle.outputFiles[0].contents);return}
 if(!url.pathname.startsWith('/api/')){response.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><div id="root"></div><script src="/bundle.js"></script>');return}
 requests.push(url.pathname)
 assert.equal(request.headers.authorization,'Bearer fixture-token')
 if(url.pathname==='/api/developer/games'&&request.method==='GET'){json(response,{data:[{id:game,title:'Managed fixture'}],maxArchiveBytes:524288000});return}
 const chunks=[];for await(const chunk of request)chunks.push(chunk)
 const bytes=Buffer.concat(chunks)
 if(url.pathname==='/api/developer/games'){
   if(request.headers.referer?.includes('registration-error=1')){response.writeHead(503,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{code:'service_unavailable'}}));return}
   json(response,{data:{gameId:game}});return
 }
 if(url.pathname.endsWith('/uploads')){json(response,{data:{id:upload,status:'uploading',upload:{partSize:33554432}}});return}
 if(url.pathname.endsWith('/parts')){json(response,{data:{parts:request.method==='POST'?[{url:storageOrigin+'/part',headers:{'Content-Length':'8'}}]:[]}});return}
 if(url.pathname.endsWith('/finalize')){json(response,{data:{id:upload,status:'queued'}});return}
 if(url.pathname==='/api/developer/submissions'){
   const form=await new Request('http://fixture',{method:'POST',headers:request.headers,body:bytes}).formData()
   submissions.push({body:JSON.parse(form.get('metadata')),cover:form.get('cover')?.type??null})
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
 await test('Chrome: anonymous sees no private identity; tabs isolate new metadata and managed update picker',async()=>{
   const page=await browser.newPage();await page.goto(origin+'/?anonymous=1')
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
   const page=await browser.newPage();await page.goto(origin)
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
 await test('Chrome: registration errors are focused, identity can be copied, and notices fit mobile',async()=>{
   const page=await browser.newPage({viewport:{width:1280,height:900}})
   await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin})
   await page.goto(origin+'/?registration-error=1')
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

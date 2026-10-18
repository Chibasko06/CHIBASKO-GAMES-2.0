import assert from 'node:assert/strict'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {multiplayerRequest} from '../lib/server/multiplayerLobbies.ts'

export async function runLobbyBrowser({A,B,actors,game,query}) {
 const bundle=(await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import DurableLobby from './components/multiplayer/DurableLobby';const segments=location.pathname.split('/');const root=createRoot(document.getElementById('app'));window.renderLobby=()=>root.render(<DurableLobby gameId="${game}" slug="arena" access={location.search.includes('private')?'private':'public'} lobbyId={segments[3]==='lobby'?segments[4]:undefined}/>);renderLobby();`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',plugins:[{name:'fixture-portal',setup(build){
  build.onResolve({filter:/^@\/components\/AuthProvider$/},()=>({path:'auth',namespace:'fixture'}))
  build.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}))
  build.onResolve({filter:/^@\/components\/game-runtime\/GameRuntime$/},()=>({path:'runtime',namespace:'fixture'}))
  build.onResolve({filter:/^\.\/MultiplayerAccess$/},()=>({path:'entry',namespace:'fixture'}))
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path==='auth'?`export function useAuth(){const actor=sessionStorage.getItem('fixtureActor');return {session:{user:{id:actor},access_token:actor},loading:false}}`:
   args.path==='navigation'?`export function useRouter(){return {push(path){location.href=path}}}`:
   args.path==='runtime'?`import React from 'react';export default function Runtime(p){return React.createElement('p',{'data-testid':'runtime'},p.onlineSessionReference)}`:
   `export const multiplayerButton='button';export function AuthInvitation(){return null}`,resolveDir:process.cwd()}))
 } }]})).outputFiles[0].text
 let turn=0
 const server=createServer(async(req,res)=>{
  try {
   const base='http://127.0.0.1:'+server.address().port,url=new URL(req.url,base)
   if(url.pathname==='/ui.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle);return}
   if(!url.pathname.startsWith('/api/')){res.setHeader('Content-Type','text/html');res.end('<div id="app"></div><script src="/ui.js"></script>');return}
   const chunks=[];for await(const chunk of req)chunks.push(chunk)
   const body=Buffer.concat(chunks),request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}: {})})
   const response=await multiplayerRequest(request,url.pathname.slice('/api/multiplayer/'.length).split('/'),{
    async actor(request){const actor=request.headers.get('authorization')?.slice(7);if(!actors.includes(actor))throw Error('fixture auth');return actor},
    service(){return turn++%2?A:B},
   })
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text())
  }catch{res.writeHead(500);res.end('fixture_error')}
 })
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true})
 try {
  const contexts=await Promise.all(actors.slice(0,2).map(async actor=>{const c=await browser.newContext();await c.addInitScript(actor=>sessionStorage.setItem('fixtureActor',actor),actor);return c}))
  const [owner,guest]=await Promise.all(contexts.map(c=>c.newPage()))
  await owner.goto(base+'/games/arena/online')
  await owner.getByRole('button',{name:'Créer un salon public'}).click()
  await owner.waitForURL('**/games/arena/lobby/*')
  const id=owner.url().split('/').at(-1)
  await guest.goto(base+'/games/arena/online')
  await guest.getByText('1 / 128 joueurs',{exact:true}).waitFor()
  // Select the exact new lobby, not another public test fixture.
  const index=await guest.locator('li').evaluateAll((rows,target)=>rows.findIndex(row=>row.textContent.includes('1 / 128')),id)
  assert.ok(index>=0)
  await guest.getByRole('button',{name:'Rejoindre',exact:true}).nth(index).click()
  await guest.waitForURL('**/games/arena/lobby/'+id)
  await guest.reload();await guest.getByText('Player (toi)',{exact:false}).waitFor()
  await owner.getByRole('button',{name:'Je suis prêt'}).click();await guest.getByRole('button',{name:'Je suis prêt'}).click()
  await owner.getByRole('button',{name:'Lancer la partie'}).click()
  await owner.getByTestId('runtime').waitFor()
  const session=await owner.getByTestId('runtime').textContent()
  await guest.getByTestId('runtime').waitFor();assert.equal(await guest.getByTestId('runtime').textContent(),session)
  await query(`set role service_role;select public.distribution_multiplayer_round('${session}','playing');select public.distribution_multiplayer_round('${session}','results')`)
  await owner.getByRole('button',{name:'Retour au salon'}).click()
  await guest.getByRole('button',{name:'Je suis prêt'}).waitFor()
  assert.equal((await A.get(actors[0],id)).status,'waiting')
  await owner.goto(base+'/games/arena/private?private')
  await owner.getByRole('button',{name:'Créer un salon privé'}).click();await owner.waitForURL('**/games/arena/lobby/*')
  const privateId=owner.url().split('/').at(-1),privateLobby=await A.get(actors[0],privateId)
  await guest.goto(base+'/games/arena/private?private');await guest.getByRole('textbox').fill(privateLobby.code.toLowerCase())
  await guest.getByRole('button',{name:'Rejoindre',exact:true}).click();await guest.waitForURL('**/games/arena/lobby/'+privateId)
  assert.equal((await B.get(actors[1],privateId)).members.length,2)
  await guest.reload();await guest.getByText('Player (toi)',{exact:false}).waitFor()
  await guest.evaluate(actor=>{sessionStorage.setItem('fixtureActor',actor);renderLobby()},actors[3])
  await guest.getByRole('alert').waitFor()
  assert.equal(await guest.getByText(privateLobby.code,{exact:false}).count(),0)
  assert.equal(await guest.getByText('Player (toi)',{exact:false}).count(),0)
  console.log('Chrome real UI + HTTP API + disposable PostgreSQL: public/private join, refresh, START, results and replay passed; no Pong gameplay.')
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}

import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {readFile,readdir} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {createServer} from 'node:http'
import {build} from 'esbuild'
import {chromium} from '@playwright/test'
import {validateWebBuild,sha256} from '../lib/game-distribution/build.ts'
import {gameArtifactKeys} from '../lib/game-distribution/keys.ts'
import {launchService} from '../lib/game-distribution/gateway/launch.ts'
import {createArtifactGateway} from '../lib/game-distribution/gateway/gateway.ts'
import {onlineSessionService} from '../lib/online-session/service.ts'
import {multiplayerLobbyService} from '../lib/multiplayer-lobby/service.ts'
import {gameLaunchRequest} from '../lib/server/gameLaunches.ts'
import {onlineRequest} from '../lib/server/onlineSessions.ts'
import {gameServerSession} from '../lib/server/gameServerSession.ts'
import {multiplayerLifecycle} from '../lib/server/multiplayerLifecycle.ts'
import {runtimeConfig} from './helpers/runtime-harness.mjs'

const q=value=>"'"+String(value).replaceAll("'","''")+"'"
const hash=value=>createHash('sha256').update(value).digest('hex')
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
async function until(check,message){for(let i=0;i<200;i++){if(await check())return;await sleep(50)}throw Error(message)}

/** Cross-repository test only. The portal installs and builds without this fixture. */
export async function runPongMigration(query){
 const repository=process.env.PONG_TEST_REPOSITORY
 assert.ok(repository,'PONG_TEST_REPOSITORY must name the independently built Pong checkout')
 const root=resolve(repository),require=createRequire(join(root,'package.json'))
 const {createPongServer}=await import(pathToFileURL(join(root,'dist/server/standalone.js')).href)
 const {platformApi}=await import(pathToFileURL(join(root,'dist/server/platform.js')).href)
 const corePackage=JSON.parse(await readFile(join(root,'node_modules/@colyseus/core/package.json'),'utf8'))
 const {matchMaker}=await import(pathToFileURL(join(root,'node_modules/@colyseus/core',corePackage.exports['.'].import)).href)
 const NodeWebSocket=require('ws'),files=new Map()
 async function visit(path=''){for(const entry of await readdir(join(root,'dist/fixtures/web',path),{withFileTypes:true})){
  const name=path+entry.name;if(entry.isDirectory())await visit(name+'/');else files.set(name,new Uint8Array(await readFile(join(root,'dist/fixtures/web',name))))
 }}await visit()
 const manifest=JSON.parse(new TextDecoder().decode(files.get('chibasko.json')))
 assert.equal(manifest.gameId,'00000000-0000-4000-8000-000000000001');assert.equal(manifest.version,'0.3.0-test.1')
 const validated=await validateWebBuild([...files].map(([path,bytes])=>({path,bytes})),{gameId:manifest.gameId,version:manifest.version})
 const versionId=randomUUID(),deployment=randomUUID(),credential=randomBytes(32).toString('hex')
 const actors=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
 const endpoint='https://gameplay.fixture.games/'
 await query(`insert into public.games(id,title,game_url,is_published) values(${q(manifest.gameId)},'Pong fixture','https://example.com',true);
 insert into public.game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count)
 values(${q(versionId)},${q(manifest.gameId)},${q(manifest.version)},1,1,${q(JSON.stringify(manifest))}::jsonb,${q(validated.artifactSha256)},${validated.artifactSize},${files.size});
 update public.game_versions set status='in_review' where id=${q(versionId)};update public.game_versions set status='approved' where id=${q(versionId)};
 update public.game_versions set status='published' where id=${q(versionId)};select public.set_active_game_version(${q(manifest.gameId)},${q(versionId)});
 insert into public.game_version_delivery_policies(version_id,connect_origins) values(${q(versionId)},'["https://gameplay.fixture.games","wss://gameplay.fixture.games"]');
 insert into public.game_server_deployments(id,game_id,hosting_mode,endpoint,status) values(${q(deployment)},${q(manifest.gameId)},'self_hosted',${q(endpoint)},'active');
 insert into public.game_server_deployment_versions values(${q(deployment)},${q(manifest.gameId)},${q(versionId)});
 insert into public.game_server_credentials(deployment_id,credential_hash,expires_at) values(${q(deployment)},${q(hash(credential))},clock_timestamp()+interval '1 hour');
 truncate public.multiplayer_api_limits;`)
 const db={async call(name,args){
  assert.match(name,/^distribution_[a-z_]+$/)
  const params=Object.entries(args).map(([key,value])=>key+' => '+(value===null?'null':typeof value==='boolean'||typeof value==='number'?String(value):typeof value==='object'?q(JSON.stringify(value))+'::jsonb':q(value))).join(',')
  try{const output=await query(`set role service_role;select public.${name}(${params})`);return output===''?undefined:output==='t'?true:output==='f'?false:JSON.parse(output)}
  catch(error){throw Error(error.stderr?.match(/ERROR:\s+([^\r\n]+)/)?.[1]??'database_error')}
 }}
 const lobbyA=multiplayerLobbyService(db),lobbyB=multiplayerLobbyService(db),online=onlineSessionService(db),launches=launchService(db,runtimeConfig,online.authorize)
 await assert.rejects(query("set role anon;select public.distribution_server_session(repeat('a',64),'s_"+'1'.repeat(32)+"')"),/permission denied/)
 const projection=JSON.parse(await query('set role anon;select coalesce(jsonb_agg(r),\'[]\') from public.get_published_game_runtimes() r'))
 assert.ok(projection.some(row=>row.game_id===manifest.gameId && row.version_id===versionId))
 const prefix=gameArtifactKeys(manifest.gameId,versionId,validated.artifactSha256).clientPrefix
 const metadata=new Map(await Promise.all([...files].map(async([path,bytes])=>[path,{size:bytes.length,sha256:await sha256(bytes),etag:path}])))
 const storage={async head(key){return key.startsWith(prefix)?metadata.get(key.slice(prefix.length))??null:null},async get(key,_meta,range){
  const bytes=key.startsWith(prefix)?files.get(key.slice(prefix.length)):null;if(!bytes)return null
  return new ReadableStream({start(c){c.enqueue(range?bytes.slice(range.offset,range.offset+range.length):bytes);c.close()}})
 }}
 const gateway=createArtifactGateway(runtimeConfig,{db,storage})
 const oldEnabled=process.env.GAME_RUNTIME_LAUNCHES_ENABLED;process.env.GAME_RUNTIME_LAUNCHES_ENABLED='1'
 const platformHttp=createServer(async(req,res)=>{
  try{
   const chunks=[];for await(const part of req)chunks.push(part)
   const request=new Request('https://portal.test'+req.url,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})})
   const sid=req.url.split('/')[5]
   const response=req.url.endsWith('/tickets/exchange')?await onlineRequest(request,undefined,()=>online,()=>{}):req.url.endsWith('/lifecycle')?await multiplayerLifecycle(request,sid,db):await gameServerSession(request,sid,db)
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
  }catch{res.writeHead(503);res.end()}
 })
 await new Promise(resolve=>platformHttp.listen(0,'127.0.0.1',resolve));const platformPort=platformHttp.address().port
 const fetchPlatform=(input,init)=>{const url=new URL(String(input));assert.equal(url.origin,'https://portal.test');return fetch('http://127.0.0.1:'+platformPort+url.pathname,init)}
 const pong=createPongServer({platform:platformApi('https://portal.test',credential,fetchPlatform),allowedOrigins:[],contentBases:['github.io']})
 let browser
 const contexts=[]
 try{
  await pong.listen(0,'127.0.0.1');const pongPort=pong.server.transport.server.address().port
  const bundle=await build({entryPoints:['tests/fixtures/runtime-host.tsx'],bundle:true,platform:'browser',format:'iife',jsx:'automatic',write:false,outdir:'.distribution/pong-e2e',define:{'process.env.NODE_ENV':'"production"'}})
  const js=bundle.outputFiles.find(f=>f.path.endsWith('.js')).contents,css=bundle.outputFiles.find(f=>f.path.endsWith('.css')).contents
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--test-third-party-cookie-phaseout']})
  const requests=[],bridge=[],errors=[]
  async function pageFor(actor){
   const context=await browser.newContext({serviceWorkers:'block'});contexts.push(context)
   let contentOrigin,lostReceipt=false
   await context.routeWebSocket('wss://gameplay.fixture.games/**',route=>{
    const url=new URL(route.url()),pending=[]
    assert.ok(!url.searchParams.has('ticket'));requests.push({kind:'socket',path:url.pathname})
    const socket=new NodeWebSocket('ws://127.0.0.1:'+pongPort+url.pathname+url.search,{headers:{Origin:contentOrigin}})
    socket.on('open',()=>{for(const data of pending)socket.send(data);pending.length=0})
    route.onMessage(data=>socket.readyState===1?socket.send(data):pending.push(data))
    socket.on('message',(data,binary)=>route.send(binary?data:data.toString()))
    socket.on('error',()=>route.close({code:1011,reason:'fixture_transport_failed'}))
    socket.on('close',()=>route.close());route.onClose(()=>socket.close())
   })
   await context.route('**/*',async route=>{
    const r=route.request(),url=new URL(r.url()),headers=await r.allHeaders()
    requests.push({kind:r.resourceType(),host:url.hostname,path:url.pathname})
    const request=new Request(r.url(),{method:r.method(),headers,...(r.postData()?{body:r.postData()}: {})})
    let response
    if(url.hostname==='portal.test'){
     if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="stylesheet" href="/host.css"><body style="margin:0"><script src="/host.js"></script>'})
     if(url.pathname==='/host.js')return route.fulfill({contentType:'text/javascript',body:Buffer.from(js)})
     if(url.pathname==='/host.css')return route.fulfill({contentType:'text/css',body:Buffer.from(css)})
     const id=url.pathname.split('/')[3]
     response=url.pathname.endsWith('/start')?await onlineRequest(request,id,()=>online,()=>{}):await gameLaunchRequest(request,id,{actor:async()=>actor,service:()=>launches})
     if(url.pathname==='/api/game-launches' && response.ok){const handle=await response.clone().json();contentOrigin=handle.data.descriptor.contentOrigin}
    }else if(url.hostname.startsWith('l-')&&url.hostname.endsWith('.github.io')){
     assert.equal(headers.authorization,undefined);assert.equal(headers.cookie,undefined)
     response=await gateway(request)
    }else if(url.origin===new URL(endpoint).origin){
     response=await fetch('http://127.0.0.1:'+pongPort+url.pathname,{method:r.method(),headers,...(r.postData()?{body:r.postData()}:{}),signal:AbortSignal.timeout(10000)})
     // Lose one successful response after reservation, not the request itself.
     if(actor===actors[0] && r.method()==='POST' && response.ok && !lostReceipt){lostReceipt=true;return route.abort('failed')}
    }
    assert.ok(response,'Unexpected external request: '+url.origin+url.pathname)
    if(response.status>=400)console.log('Fixture HTTP failure',url.pathname,response.status)
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})
   })
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
   await page.addInitScript(()=>{
    // Preserve the native constructor's synchronous argument check. Playwright's
    // WebSocket routing shim otherwise turns the SDK's Node-header probe async.
    const Native=window.WebSocket
    window.WebSocket=class extends Native{constructor(url,protocols){if(protocols!==undefined && typeof protocols!=='string' && !Array.isArray(protocols))throw new TypeError('Invalid WebSocket protocols');super(url,protocols)}}
    window.addEventListener('message',e=>{if(e.data?.channel==='chibasko.game')console.debug('bridge-event:'+e.data.type)})
   })
   page.on('console',m=>{if(m.text().startsWith('bridge-event:'))bridge.push(m.text().slice(13))})
   await page.goto('https://portal.test/');await page.waitForFunction(()=>!!window.runtimeFixture)
   return page
  }
  const pages=await Promise.all(actors.map(pageFor))
  let lobby=await lobbyA.create(actors[0],manifest.gameId,'public',randomUUID())
  await lobbyB.mutate(actors[1],lobby.id,'join')
  async function round(){
   for(const actor of actors)await lobbyA.mutate(actor,lobby.id,'ready',true)
   lobby=await lobbyB.mutate(actors[0],lobby.id,'start')
   const sid=lobby.onlineSessionReference
   for(let i=0;i<2;i++)await pages[i].evaluate(request=>window.runtimeFixture.open(request),{gameId:manifest.gameId,gameVersionId:versionId,execution:'online',audience:'published',locale:'fr',onlineSessionReference:sid})
   try{await until(()=>matchMaker.getLocalRoomById(sid)?.state.phase==='COUNTDOWN','Two browsers did not reach one authoritative countdown')}
   catch(error){console.log('Runtime fixture diagnostics',JSON.stringify({bridge,errors,requests,ui:await Promise.all(pages.map(page=>page.locator('body').innerText()))}));throw error}
   const room=matchMaker.getLocalRoomById(sid)
   assert.equal(room.clients.length,2);assert.equal(room.state.players.size,2)
   const players=[...room.state.players.values()];assert.notEqual(players[0].side,players[1].side)
   assert.equal((await lobbyA.get(actors[0],lobby.id)).status,'playing')
   assert.equal(await query(`select count(*) from public.game_connection_tickets where session_id=${q(sid)} and consumed_at is not null`),'2')
   return {sid,room,players}
  }
  const first=await round()
  const frames=pages.map(page=>page.frames().find(f=>f.url().startsWith('https://l-')))
  await Promise.all(frames.map(f=>f.locator('canvas').waitFor()))
  first.room.setSimulationInterval()
  // Advance the existing authoritative engine; no production acceleration endpoint.
  for(let i=0;i<100;i++)first.room.driver.tick(1000/30)
  assert.equal(first.room.state.phase,'PLAYING')
  const before=[first.room.state.leftPaddleY,first.room.state.rightPaddleY]
  await pages[0].bringToFront();await frames[0].locator('canvas').focus();await pages[0].keyboard.down('ArrowUp')
  await sleep(100);first.room.driver.tick(100)
  assert.ok(first.room.state.leftPaddleY!==before[0] || first.room.state.rightPaddleY!==before[1],'Browser inputs must reach authoritative paddles')
  await pages[0].keyboard.up('ArrowUp')
  // Holding both paddles at one edge leaves the normal deterministic ball path open.
  for(const frame of frames)await frame.getByRole('button',{name:'Monter la raquette'}).evaluate(button=>button.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
  await sleep(100)
  for(let i=0;i<15000 && first.room.state.phase!=='FINISHED';i++)first.room.driver.tick(1000/30)
  assert.equal(first.room.state.phase,'FINISHED')
  assert.equal(Math.max(first.room.state.leftScore,first.room.state.rightScore),5)
  await until(async()=>(await lobbyA.get(actors[0],lobby.id)).status==='results','Results did not reach durable lobby')
  await sleep(100)
  for(const frame of frames)assert.match(await frame.locator('body').textContent(),/5|Victoire|Termin/)
  for(const page of pages)await page.evaluate(()=>window.runtimeFixture.unmount())
  await lobbyA.mutate(actors[0],lobby.id,'replay')
  const second=await round();assert.notEqual(first.sid,second.sid)
  await pages[1].getByRole('button',{name:'Quitter le jeu'}).click()
  await until(()=>second.room.state.phase==='FINISHED','Leave must forfeit the second round')
  await until(async()=>(await lobbyA.get(actors[0],lobby.id)).status==='results','Forfeit did not close the round')
  assert.ok(bridge.includes('GAME_HELLO')&&bridge.includes('GAME_READY'))
  assert.deepEqual(errors,[])
  assert.ok(requests.every(r=>!r.path.includes('ticket=')))
  const row=await query(`select safe_context::text from public.game_launch_sessions where version_id=${q(versionId)} limit 1`)
  for(const actor of actors)assert.ok(!row.includes(actor))
  assert.doesNotMatch(row,/email|supabase|credential|ticket|reservation/i)
  await assert.rejects(query(`set role authenticated;select public.distribution_server_session(${q(hash(credential))},${q(first.sid)})`),/permission denied/)
  assert.equal((await db.call('distribution_server_session',{p_credential_hash:'f'.repeat(64),p_session:first.sid})).error.code,'invalid_credential')
  const localPage=await pageFor(null),localRequestsStart=requests.length
  await localPage.clock.install()
  await localPage.evaluate(request=>window.runtimeFixture.open(request),{gameId:manifest.gameId,gameVersionId:versionId,execution:'local',audience:'published',locale:'fr'})
  await localPage.locator('[data-phase="running"]').waitFor()
  const local=localPage.frames().find(f=>f.url().startsWith('https://l-'))
  await local.locator('canvas').waitFor();await localPage.clock.runFor(3300)
  assert.match(await local.getByRole('status').innerText(),/À toi de jouer/)
  assert.ok(!requests.slice(localRequestsStart).some(r=>r.host==='gameplay.fixture.games'||r.kind==='socket'))
  await localPage.getByRole('button',{name:'Quitter le jeu'}).click();assert.equal(await localPage.locator('iframe').count(),0)
  console.log('Pong E2E: real PostgreSQL, durable lobby, two Chrome contexts, public SDK 0.3.0, real runtime/gateway, START v2, HTTP exchange, one authoritative room, inputs, score 5, replay, forfeit and anonymous local without gameplay network passed.')
 }finally{
  for(const context of contexts)await context.close();await browser?.close();await pong.close()
  await new Promise(resolve=>platformHttp.close(resolve))
  if(oldEnabled===undefined)delete process.env.GAME_RUNTIME_LAUNCHES_ENABLED;else process.env.GAME_RUNTIME_LAUNCHES_ENABLED=oldEnabled
 }
}

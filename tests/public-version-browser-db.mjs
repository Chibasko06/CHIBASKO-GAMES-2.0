import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {chromium,firefox,webkit} from '@playwright/test'
import {localHTTPSFixture} from './helpers/local-https.mjs'

export async function publicVersionBrowserIntegration(query){
 await import('./register.mjs')
 const {launchService}=await import('../lib/game-distribution/gateway/launch.ts'),{createArtifactGateway}=await import('../lib/game-distribution/gateway/gateway.ts'),{UploadError}=await import('../lib/game-distribution/uploads/policy.ts'),{sha256}=await import('../lib/game-distribution/build.ts')
 const q=value=>value==null?'null':typeof value==='object'?"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb":"'"+String(value).replaceAll("'","''")+"'"
 const db={async call(name,args){assert.match(name,/^distribution_[a-z_]+$/);try{return JSON.parse(await query(`begin;set local role service_role;select coalesce(to_jsonb(public.${name}(${Object.entries(args).map(([key,value])=>{assert.match(key,/^p_[a-z_]+$/);return key+'=>'+q(value)}).join(',')})),'null'::jsonb);commit;`))}catch(error){const code=error.stderr?.match(/(?:launch_expired|delivery_version_conflict|ticket_replayed|version_not_found|account_restricted)/)?.[0];if(!code)throw error;throw new UploadError(code,code==='delivery_version_conflict'||code==='ticket_replayed'?409:403)}}}
 const owner=randomUUID();await query(`insert into auth.users(id,email) values('${owner}','versions-${owner}@example.test')`)
 const game=await query(`select distribution_register_game('${owner}','${randomUUID()}','Versions navigateur')`),versions=[randomUUID(),randomUUID()],objects=new Map()
 for(const [i,id]of versions.entries()){
  const version=(i+1)+'.0.0',manifest={schemaVersion:1,gameId:game,version,integrationVersion:1,integration:{mode:'classic'},capabilities:{local:{players:{min:1,max:1}}},client:{entrypoints:{local:'index.html'}}}
  await query(`insert into game_versions(id,game_id,version,schema_version,integration_version,manifest,artifact_sha256,artifact_size,file_count) values('${id}','${game}','${version}',1,1,${q(manifest)},repeat('a',64),100,4);update game_versions set status='in_review' where id='${id}';update game_versions set status='approved' where id='${id}';update game_versions set status='published' where id='${id}'`)
  const prefix=await query(`select storage_prefix from game_versions where id='${id}'`)
  const files={'index.html':'<!doctype html><title>Version '+version+'</title><button>'+version+'</button><script>window.loadModule=()=>import("/module.js")</script>','asset.data':version,'module.js':"export {version} from './nested.js'",'nested.js':'export const version='+JSON.stringify(version)}
  for(const [path,text]of Object.entries(files)){const bytes=new TextEncoder().encode(text);objects.set(prefix+path,{bytes,size:bytes.length,sha256:await sha256(bytes),etag:path})}
 }
 await query(`update games set is_published=true where id='${game}';select set_active_game_version('${game}','${versions[0]}')`)
 const config={publicBase:'chibaskogames-play.fr',previewBase:'chibaskogames-play.fr',contentBase:'chibaskogames-play.fr',portalOrigins:['https://portal.test'],stableOrigins:true},service=launchService(db,config)
 const gateway=createArtifactGateway(config,{db,storage:{async head(key){return objects.get(key)??null},async get(key){const object=objects.get(key);return object?new Blob([object.bytes]).stream():null}}})
 const traces=[]
 const transport=await localHTTPSFixture(host=>host==='portal.test'||/^g-[a-f0-9]{32}\.chibaskogames-play\.fr$/.test(host),async request=>{
  const u=new URL(request.url)
  if(u.origin==='https://portal.test')return new Response('<!doctype html><title>Publication de test</title><script>window.failures=[];addEventListener("message",e=>{if(e.data?.channel==="chibasko.delivery")failures.push(e.data.type)})</script>',{headers:{'Content-Type':'text/html'}})
  const response=await gateway(request);traces.push({path:u.pathname,status:response.status,method:request.method,referrer:request.headers.get('referer')?new URL(request.headers.get('referer')).pathname:null});return response
 })
 let browser,context,first,second,restored
 try{
  const engine=process.env.RUNTIME_BROWSER_ENGINE??'chromium',type={chromium,firefox,webkit}[engine];assert.ok(type,'Moteur inconnu')
  browser=await type.launch({headless:true,proxy:{server:transport.proxy},...(engine==='chromium'?{channel:'chrome'}:{})});context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true})
  console.log('Qualification versions :',engine,browser.version(),'; serveur HTTPS local et PostgreSQL jetable.')
  const page=await context.newPage();await page.goto('https://portal.test/')
  const issue=v=>service.create(null,{gameId:game,gameVersionId:v,audience:'published',execution:'local',locale:'fr'})
  async function mount(handle,id){const d=handle.descriptor,url=new URL('/_launch/bootstrap',d.contentOrigin);url.hash=new URLSearchParams({ticket:d.delivery.ticket,cgLaunch:d.launchId,cgGeneration:d.generation,cgParent:'https://portal.test'});await page.evaluate(({src,id})=>{const f=document.createElement('iframe');f.id=id;f.sandbox='allow-scripts allow-same-origin allow-pointer-lock';f.src=src;document.body.append(f)},{src:url.href,id});return page.frameLocator('#'+id)}
  first=await issue(versions[0]);const a=await mount(first,'old');await a.getByRole('button',{name:'1.0.0',exact:true}).waitFor();const old=await (await page.locator('#old').elementHandle()).contentFrame();await old.evaluate(()=>localStorage.setItem('save','partie conservee'))
  await query(`select set_active_game_version('${game}','${versions[1]}')`)
  second=await issue(versions[1]);const b=await mount(second,'new');await b.getByRole('button',{name:'2.0.0',exact:true}).waitFor();const current=await (await page.locator('#new').elementHandle()).contentFrame()
  const previousAsset=await old.evaluate(async()=>await(await fetch('/asset.data')).text())
  if(previousAsset!=='1.0.0')console.error('Trajet versions sans secret :',JSON.stringify({traces,rows:await query(`select jsonb_agg(jsonb_build_object('version',version,'status',status)) from game_versions where game_id='${game}'`)}))
  assert.equal(previousAsset,'1.0.0','Le lecteur existant conserve ses fichiers pendant le changement de version active')
  await service.release(first.descriptor.launchId,first.controlToken)
  const late=await old.evaluate(async()=>{const r=await fetch('/asset.data');return {status:r.status,body:await r.text()}})
  assert.equal(late.status,403,'Un ancien document ne doit jamais recevoir un asset de la nouvelle version')
  assert.ok(!late.body.includes('2.0.0'))
  assert.equal(await current.evaluate(async()=>await(await fetch('/asset.data')).text()),'2.0.0')
  assert.equal(await current.evaluate(async()=>(await window.loadModule()).version),'2.0.0','Les modules et leurs imports relatifs conservent la version')
  assert.equal(await current.evaluate(()=>localStorage.getItem('save')),'partie conservee')
  assert.equal(await current.evaluate(async()=>(await fetch('/asset.data',{referrerPolicy:'no-referrer'})).status),403,'Aucun choix de version implicite quand le contexte manque')
  assert.equal(await current.evaluate(async()=>(await fetch(new URL('asset.data',location.href),{referrerPolicy:'no-referrer'})).status),200,'Un chemin déjà épinglé ne dépend pas du référent')
  assert.equal(await current.evaluate(async ticket=>(await fetch('/_launch/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket})})).status,second.descriptor.delivery.ticket),409)
  await service.release(second.descriptor.launchId,second.controlToken)
  await query(`select set_active_game_version('${game}','${versions[0]}')`)
  restored=await issue(versions[0]);const back=await mount(restored,'restored');await back.getByRole('button',{name:'1.0.0',exact:true}).waitFor()
  assert.equal(await current.evaluate(async()=>(await fetch('/asset.data')).status),403,'Le document de la version retirée ne reçoit pas les fichiers du retour arrière')
  console.log('Versions navigateur/PostgreSQL PASS : publication concurrente, anciennes sessions conservées, document révoqué, fichiers épinglés, modules, rejeu refusé, retour arrière et sauvegarde locale.')
 }catch(error){console.error('Trajet versions sans secret :',JSON.stringify(traces));throw error}finally{for(const handle of [first,second,restored])if(handle)await service.release(handle.descriptor.launchId,handle.controlToken).catch(()=>{});await context?.close();await browser?.close();await transport.close()}
}

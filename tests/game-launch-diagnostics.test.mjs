import test from 'node:test'
import assert from 'node:assert/strict'
import {createLaunchService,gameLaunchRequest} from '../lib/server/gameLaunches.ts'
import {launchConfiguration,requireLaunchAuthenticationConfiguration} from '../lib/server/gameLaunchConfiguration.ts'
import {launchService} from '../lib/game-distribution/gateway/launch.ts'
import {GatewayError} from '../lib/game-distribution/gateway/contracts.ts'
import {UploadError} from '../lib/game-distribution/uploads/policy.ts'
import {runtimeHarness} from './helpers/runtime-harness.mjs'
import {readFile} from 'node:fs/promises'
const environment=()=>({GAME_RUNTIME_LAUNCHES_ENABLED:'1',GAME_CONTENT_BASE_DOMAIN:'chibaskogames-play.fr',GAME_CONTENT_PUBLIC_BASE:'chibaskogames-play.fr',GAME_CONTENT_PREVIEW_BASE:'chibaskogames-play.fr',GAME_PORTAL_ORIGINS:'https://chibaskogames.fr,https://www.chibaskogames.fr',NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-private-service'})
const request=body=>new Request('https://chibaskogames.fr/api/game-launches',{method:'POST',headers:{Origin:'https://chibaskogames.fr',Authorization:'Bearer fixture-private-jwt','Content-Type':'application/json'},body:JSON.stringify(body)})
test('missing portal flag reproduces 503 before auth/RPC with names-only configuration diagnostic',async()=>{
 const h=await runtimeHarness('solo','preview'),logs=[]
 const env=environment();delete env.GAME_RUNTIME_LAUNCHES_ENABLED
 const response=await gameLaunchRequest(request(h.request),undefined,{actor:()=>assert.fail('Configuration fails first'),service:context=>createLaunchService(context,env,()=>assert.fail('No RPC')),log:entry=>logs.push(entry)})
 assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:{code:'service_unavailable'}})
 assert.equal(logs[0].phase,'configuration');assert.equal(logs[0].reason,'launches_disabled');assert.deepEqual(logs[0].configuration.missing,['GAME_RUNTIME_LAUNCHES_ENABLED'])
 assert.equal(logs[0].requestId,response.headers.get('X-Request-Id'))
 assert.doesNotMatch(JSON.stringify(logs),/fixture-private|https:|Bearer/)
})
test('portal config accepts real registrable content domain without PSL; wrong origin and missing environment fail closed',()=>{
 assert.equal(launchConfiguration(environment()).contentBase,'chibaskogames-play.fr')
 assert.throws(()=>requireLaunchAuthenticationConfiguration({NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co'}),error=>error.configuration.missing.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'))
 for(const name of ['GAME_CONTENT_BASE_DOMAIN','GAME_PORTAL_ORIGINS','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']){const env=environment();delete env[name];assert.throws(()=>launchConfiguration(env),error=>error.configuration.missing.includes(name))}
 for(const change of [{GAME_CONTENT_BASE_DOMAIN:'chibaskogames.fr'},{GAME_CONTENT_BASE_DOMAIN:'https://chibaskogames-play.fr'},{GAME_PORTAL_ORIGINS:'not-an-origin'},{GAME_PORTAL_ORIGINS:'https://fixture-private-secret@chibaskogames.fr'}])assert.throws(()=>launchConfiguration({...environment(),...change}),error=>error.code==='invalid_gateway_configuration'&&!JSON.stringify(error.configuration).includes('fixture-private'))
})
test('authenticated admin preview reaches authorization, version resolution and launch creation without publishing or reading R2',async()=>{
 const h=await runtimeHarness('solo','preview'),logs=[],calls=[],config=environment()
 const response=await gameLaunchRequest(request(h.request),undefined,{actor:async()=>'admin',service:context=>createLaunchService(context,config,async(url,init)=>{const name=new URL(url).pathname.split('/').at(-1);calls.push(name);return Response.json(await h.db.call(name,JSON.parse(init.body))??null)}),log:entry=>logs.push(entry)})
 assert.equal(response.status,201);const {data}=await response.json()
 assert.match(data.descriptor.contentOrigin,/^https:\/\/l-[a-f0-9]{48}\.chibaskogames-play\.fr$/)
 assert.ok(data.descriptor.entrypointUrl.endsWith('/play/start.html'));assert.equal(h.row.status,'draft')
 assert.deepEqual(calls,['distribution_authorize_launch','distribution_resolve_version','distribution_create_launch']);assert.equal(logs.length,0)
 assert.doesNotMatch(JSON.stringify(data.descriptor),/fixture-private|storage_prefix|service_role|staging_key/)
 const denied=await gameLaunchRequest(request({...h.request,audience:'published'}),undefined,{actor:async()=>'admin',service:context=>launchService(h.db,launchConfiguration(config),undefined,context.phase),log:entry=>logs.push(entry)})
 assert.equal(denied.status,404);assert.equal(h.sessions.size,1)
})
test('database error reports failing phase and RPC status without arguments, token, URL or stack',async()=>{
 const h=await runtimeHarness('solo','preview'),logs=[]
 for(const failing of ['distribution_resolve_version','distribution_create_launch']){
  const response=await gameLaunchRequest(request(h.request),undefined,{actor:async()=>'admin',service:context=>createLaunchService(context,environment(),async(url,init)=>{const name=new URL(url).pathname.split('/').at(-1);if(name===failing)return Response.json({code:'42501',message:'fixture-private-secret sql query https://l-private.capability/'},{status:403});return Response.json(await h.db.call(name,JSON.parse(init.body))??null)}),log:entry=>logs.push(entry)})
  assert.equal(response.status,503);const entry=logs.at(-1)
  assert.equal(entry.phase,'database');assert.equal(entry.stage,failing==='distribution_resolve_version'?'version_resolution':'launch_session_creation');assert.equal(entry.rpc.operation,failing);assert.equal(entry.rpc.upstreamCode,'42501')
  assert.doesNotMatch(JSON.stringify(entry)+await response.text(),/fixture-private|https:|storage_prefix|Bearer|capability|42501.*sql/)
 }
})
test('authentication, corrupt version, gateway resolution and unexpected errors have distinct safe diagnostics',async()=>{
 const h=await runtimeHarness('solo','preview'),config=launchConfiguration(environment()),logs=[]
 const deps={actor:async()=>'admin',service:context=>launchService(h.db,config,undefined,context.phase),log:entry=>logs.push(entry)}
 assert.equal((await gameLaunchRequest(request(h.request),undefined,{...deps,actor:async()=>{throw new GatewayError('unauthorized',401)}})).status,401);assert.equal(logs.at(-1).phase,'authentication')
 const bad={call:async(name,args)=>{const row=await h.db.call(name,args);return name==='distribution_resolve_version'?{...row,storage_prefix:'fixture-private-prefix'}:row}}
 assert.equal((await gameLaunchRequest(request(h.request),undefined,{...deps,service:context=>launchService(bad,config,undefined,context.phase)})).status,503)
 assert.equal(logs.at(-1).phase,'version_resolution');assert.equal(logs.at(-1).code,'invalid_version_record')
 const badSession={call:async(name,args)=>name==='distribution_create_launch'?null:h.db.call(name,args)}
 assert.equal((await gameLaunchRequest(request(h.request),undefined,{...deps,service:context=>launchService(badSession,config,undefined,context.phase)})).status,503)
 assert.equal(logs.at(-1).phase,'launch_session_creation');assert.equal(logs.at(-1).code,'invalid_launch_session')
 const failOrigin=context=>({...h.service,create:async()=>{context.phase('artifact_gateway_resolution');throw new GatewayError('invalid_launch',400)}})
 assert.equal((await gameLaunchRequest(request(h.request),undefined,{...deps,service:failOrigin})).status,400);assert.equal(logs.at(-1).phase,'artifact_gateway_resolution')
 const unexpected=await gameLaunchRequest(request(h.request),undefined,{...deps,actor:async()=>{throw Error('fixture-private-jwt cookie secret')}})
 assert.equal(unexpected.status,503);assert.equal(logs.at(-1).phase,'unexpected');assert.equal(logs.at(-1).stage,'authentication')
 assert.doesNotMatch(JSON.stringify(logs),/fixture-private|cookie secret/)
})
test('logging failure does not affect launch responses; checked-in portal and Gateway configs use the same hosts',async()=>{
 const h=await runtimeHarness('solo','preview')
 const response=await gameLaunchRequest(request(h.request),undefined,{actor:async()=>{throw new UploadError('forbidden',403)},service:()=>h.service,log:()=>{throw Error('fixture-private-logger')}})
 assert.equal(response.status,403)
 const portal=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'))
 assert.equal(portal.vars.GAME_RUNTIME_LAUNCHES_ENABLED,'1')
 assert.doesNotThrow(()=>launchConfiguration({...portal.vars,SUPABASE_SERVICE_ROLE_KEY:'fixture-private-service'}))
 const gateway=JSON.parse(await readFile(new URL('../cloudflare/wrangler.artifacts.production.jsonc',import.meta.url),'utf8'))
 for(const name of ['GAME_CONTENT_BASE_DOMAIN','GAME_CONTENT_PUBLIC_BASE','GAME_CONTENT_PREVIEW_BASE','GAME_PORTAL_ORIGINS'])assert.equal(portal.vars[name],gateway.vars[name])
})

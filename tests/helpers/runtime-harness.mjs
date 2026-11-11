import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {validateWebBuild,sha256} from '../../lib/game-distribution/build.ts'
import {gameArtifactKeys} from '../../lib/game-distribution/keys.ts'
import {launchService} from '../../lib/game-distribution/gateway/launch.ts'
import {createArtifactGateway} from '../../lib/game-distribution/gateway/gateway.ts'
import {UploadError} from '../../lib/game-distribution/uploads/policy.ts'
export const runtimeConfig={publicBase:'github.io',previewBase:'github.io',contentBase:'github.io',portalOrigins:['https://portal.test']}
// github.io is a real PSL boundary used ONLY by intercepted browser fixtures.
// No request goes to GitHub; every browser request is fulfilled locally by tests.
export async function runtimeHarness(kind='solo',audience='published',behavior='normal',configuration=runtimeConfig,integration,prepareBuild) {
  const root=new URL('../fixtures/runtime-builds/'+kind+'/',import.meta.url),manifest=JSON.parse(await readFile(new URL('chibasko.json',root),'utf8'))
  if(integration)manifest.integration={mode:integration}
  const versionId=randomUUID(),files=new Map()
  files.set('chibasko.json',new TextEncoder().encode(JSON.stringify(manifest)))
  const bridge=await readFile(new URL('../fixtures/runtime-builds/bridge-fixture.js',import.meta.url))
  files.set('bridge-fixture.js',new Uint8Array(bridge))
  files.set('asset.data',new Uint8Array([1,2,3,4]));files.set('sw.js',new TextEncoder().encode('self.addEventListener("fetch",()=>{})'))
  for(const path of new Set(Object.values(manifest.client.entrypoints))) {
    let html=await readFile(new URL(path,root),'utf8');html=html.replace('data-behavior="normal"','data-behavior="'+behavior+'"')
    if(integration==='classic')html='<!doctype html><title>Jeu classique sans SDK</title><button id="play" onclick="this.textContent=\'Partie démarrée\'">Jouer</button>'
    files.set(path,new TextEncoder().encode(html))
  }
  if(prepareBuild)await prepareBuild(files,manifest)
  const validated=await validateWebBuild([...files].map(([path,bytes])=>({path,bytes})),{gameId:manifest.gameId,version:manifest.version})
  const prefix=gameArtifactKeys(manifest.gameId,versionId,validated.artifactSha256).clientPrefix
  const row={id:versionId,game_id:manifest.gameId,version:manifest.version,schema_version:1,integration_version:1,status:audience==='preview'?'draft':'published',
    manifest,artifact_sha256:validated.artifactSha256,storage_prefix:prefix,delivery_policy:{profile:'web-v1',connectOrigins:[],assetOrigins:[]}}
  const sessions=new Map(),deliveries=new Map(),cookies=new Map(),members=new Set(['owner','editor','admin']),logs=[],calls=[],released=[],clock={offset:0,fixed:undefined,now(){return (this.fixed ?? Date.now())+this.offset}}
  function authorize(args) {
    if(args.p_version!==versionId || args.p_game!==manifest.gameId)throw new UploadError('version_not_found',404)
    if(args.p_audience==='preview') {
      if(!args.p_actor)throw new UploadError('unauthorized',401)
      if(!members.has(args.p_actor))throw new UploadError('preview_forbidden',403)
      if(!['draft','in_review','approved'].includes(row.status))throw new UploadError('version_not_previewable',409)
    }else if(row.status!=='published')throw new UploadError('version_not_found',404)
    if(!manifest.client.entrypoints[args.p_execution])throw new UploadError('unsupported_execution',400)
    if(args.p_execution==='online' && !args.p_actor)throw new UploadError('unauthorized',401)
  }
  const db={async call(name,args){calls.push(name)
    if(name==='distribution_issue_public_delivery'){
      const entry=[...sessions.entries()].find(([,s])=>s.id===args.p_launch&&s.p_control_hash===args.p_control_hash)
      if(!entry||entry[1].p_audience!=='published')throw new UploadError('forbidden',403)
      const replacement=await sha256(new TextEncoder().encode(randomUUID()));sessions.delete(entry[0]);sessions.set(replacement,entry[1]);deliveries.set(args.p_ticket_hash,{session:entry[1],expires:clock.now()+60000,used:false});return
    }
    if(['distribution_exchange_public_delivery','distribution_exchange_shared_public_delivery','distribution_exchange_versioned_public_delivery'].includes(name)){
      if(behavior==='version-conflict')throw new UploadError('delivery_version_conflict',409)
      const d=deliveries.get(args.p_ticket_hash)
      if(args.p_game!==manifest.gameId||!d||d.expires<=clock.now())throw new UploadError('launch_expired',403)
      if(d.used)throw new UploadError('ticket_replayed',409)
      if(d.session.revoked||Date.parse(d.session.expires_at)<=clock.now())throw new UploadError('launch_expired',403)
      authorize(d.session);d.used=true
      const previous=cookies.get(args.p_previous_hash),reused=Boolean(name!=='distribution_exchange_public_delivery'&&previous?.some(s=>!s.revoked&&Date.parse(s.expires_at)>clock.now())),key=reused?args.p_previous_hash:args.p_cookie_hash
      const group=cookies.get(key)??[];group.push(d.session);cookies.set(key,group)
      return {...d.session,delivery_cookie_reused:reused}
    }
    if(name==='distribution_check_public_delivery'||name==='distribution_check_versioned_public_delivery'){
      const s=cookies.get(args.p_cookie_hash)?.findLast(s=>!s.revoked&&Date.parse(s.expires_at)>clock.now()&&(name!=='distribution_check_versioned_public_delivery'||s.version_id===args.p_version))
      if(args.p_game!==manifest.gameId||!s||s.revoked||Date.parse(s.expires_at)<=clock.now())throw new UploadError('launch_expired',403)
      authorize(s);return s
    }
    if(name==='distribution_resolve_version')return args.p_version===versionId?structuredClone(row):null
    if(name==='distribution_authorize_launch'){authorize(args);return}
    if(name==='distribution_create_launch') {
      authorize(args)
      const s={...args,id:randomUUID(),version_id:versionId,generation:randomUUID(),created_at:clock.now(),expires_at:new Date(clock.now()+args.p_seconds*1000).toISOString(),safe_context:args.p_context,revoked:false}
      sessions.set(args.p_capability_hash,s);return s
    }
    if(name==='distribution_check_launch') {
      const s=sessions.get(args.p_capability_hash)
      if(!s || s.revoked || Date.parse(s.expires_at)<=clock.now())throw new UploadError('launch_expired',403)
      authorize(s);return s
    }
    if(name==='distribution_revoke_launch') {
      const s=[...sessions.values()].find(s=>s.id===args.p_id && s.p_control_hash===args.p_control_hash)
      if(!s)throw new UploadError('launch_expired',403)
      s.revoked=true;released.push(s.id);return
    }
    if(name==='distribution_renew_launch') {
      const s=[...sessions.values()].find(s=>s.id===args.p_id && s.p_control_hash===args.p_control_hash)
      if(!s || s.revoked || Date.parse(s.expires_at)<=clock.now() || clock.now()>=s.created_at+86400000)throw new UploadError('launch_expired',403)
      authorize(s);s.expires_at=new Date(Math.min(clock.now()+args.p_seconds*1000,s.created_at+86400000)).toISOString();return structuredClone(s)
    }
    throw new Error(name)
  }}
  const metadata=new Map(await Promise.all([...files].map(async([path,bytes])=>[path,{size:bytes.length,sha256:await sha256(bytes),etag:path}])))
  const storage={async head(key){return key.startsWith(prefix)?metadata.get(key.slice(prefix.length)) ?? null:null},async get(key,_metadata,range){
    const bytes=key.startsWith(prefix)?files.get(key.slice(prefix.length)):null
    if(!bytes)return null
    const selected=range?bytes.slice(range.offset,range.offset+range.length):bytes
    return new ReadableStream({start(c){c.enqueue(selected);c.close()}})
  }}
  const online=async(_actor,request)=>({gameId:manifest.gameId,gameVersionId:versionId,execution:'online',locale:request.locale,
    participants:[{participantId:'p_'+randomUUID().replaceAll('-',''),username:'Player A'},{participantId:'p_'+randomUUID().replaceAll('-',''),username:'Player B'}],
    // Assigned below after participants exist; never a transport ID or Auth UUID.
  })
  const service=launchService(db,configuration,async(actor,request)=>{const c=await online(actor,request);return {...c,session:{sessionId:'s_'+randomUUID().replaceAll('-',''),localParticipantIds:[c.participants[0].participantId]}}})
  const request={gameId:manifest.gameId,gameVersionId:versionId,execution:kind==='online'?'online':'local',audience,locale:'fr',...(kind==='online'?{onlineSessionReference:'prepared-session-reference'}:{})}
  const client={create:(req)=>service.create(req.audience==='preview'||req.execution==='online'?'owner':null,req),renew:h=>service.renew(h.descriptor.launchId,h.controlToken),release:h=>service.release(h.descriptor.launchId,h.controlToken)}
  const gateway=createArtifactGateway(configuration,{db,storage,log:event=>logs.push(event)})
  return {row,request,service,client,db,files,sessions,members,logs,calls,released,gateway,clock}
}

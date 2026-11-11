import type { UploadRepository } from '../uploads/contracts'
import { UploadError } from '../uploads/policy'
import { artifactMedia } from '../paths'
import type { ArtifactReader, ArtifactRange } from '../storage'
import { resolveGameVersion, validateGatewayConfiguration } from './resolver'
import { previewService } from './preview'
import { launchService } from './launch'
import { artifactRequestPath, parseByteRange, previewCookieValue } from './http'
import { gameSecurityHeaders } from './headers'
import { GatewayError, PREVIEW_COOKIE, type GatewayConfiguration } from './contracts'
import { sha256 } from '../build'
import {PUBLIC_BOOTSTRAP,PUBLIC_EXCHANGE,publicBootstrap,publicCookieValue,publicGameIdentity,publicBuildPath,publicVersionRequest,publicCookieHeader} from './public-origin'
import {storageProbeHost,storageProbeResponse} from './storage-probe'

type GatewayEvent={event:'artifact_request';requestId:string;gameId?:string;gameVersionId?:string;pathSha256?:string;status:number}
type Dependencies={db:UploadRepository;storage:ArtifactReader;log?:(event:GatewayEvent)=>void}
function hostIdentity(host:string,config:GatewayConfiguration) {
  const game=config.contentBase?publicGameIdentity(host,config.contentBase):null
  if(game)return {kind:'stable' as const,id:game}
  const launch=new RegExp('^l-([a-f0-9]{48})\\.'+(config.contentBase ?? '').replaceAll('.','\\.')+'$').exec(host)
  if(config.contentBase && launch)return {kind:'launch' as const,id:launch[1]}
  // Launch delivery has no cookie-based preview or public version-host fallback.
  if(config.contentBase)throw new GatewayError('version_not_found',404)
  for(const kind of ['public','preview'] as const) {
    const base=kind==='public'?config.publicBase:config.previewBase,prefix=kind==='public'?'v-':'p-'
    if(!host.endsWith('.'+base))continue
    const label=host.slice(0,-base.length-1)
    if(!label.startsWith(prefix) || !/^[a-f0-9]{32}$/.test(label.slice(2)))continue
    const h=label.slice(2),id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
    return {kind,id}
  }
  throw new GatewayError('version_not_found',404)
}
async function readTicket(request:Request) {
  if(request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')throw new GatewayError('invalid_preview_request',400)
  const reader=request.body?.getReader();if(!reader)throw new GatewayError('invalid_preview_request',400)
  const chunks:Uint8Array[]=[];let size=0
  try {while(true){const item=await reader.read();if(item.done)break;size+=item.value.length
    if(size>512){await reader.cancel();throw new GatewayError('invalid_preview_request',400)}chunks.push(item.value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  let text:string
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw new GatewayError('invalid_preview_request',400)}
  const form=new URLSearchParams(text)
  if([...form.keys()].length!==1 || !form.has('ticket'))throw new GatewayError('invalid_preview_request',400)
  return form.get('ticket')!
}
function previewFetchAllowed(request:Request,origin:string,portals:readonly string[]) {
  const supplied=request.headers.get('origin'),site=request.headers.get('sec-fetch-site')
  const navigation=request.headers.get('sec-fetch-dest')==='document' && request.headers.get('sec-fetch-mode')==='navigate'
  if(navigation)return !supplied || supplied===origin || portals.includes(supplied)
  if(supplied && supplied!==origin)return false
  // Top-level navigation is allowed; framing remains restricted by CSP. Other
  // games must not use same-site cookies to fetch or embed a private subresource.
  return !site || site==='same-origin' || site==='none'
}
export function createArtifactGateway(configuration:GatewayConfiguration,deps:Dependencies) {
  const config=validateGatewayConfiguration(configuration),previews=previewService(deps.db,config)
  const launches=config.contentBase?launchService(deps.db,{...config,contentBase:config.contentBase}):null
  return async function serve(request:Request):Promise<Response> {
    const requestId=crypto.randomUUID();let gameId:string|undefined,versionId:string|undefined,path:string|undefined,pathSha256:string|undefined,response:Response,exchangeCookie=false
    try {
      const url=new URL(request.url)
      if(url.protocol!=='https:' || url.port || url.username || url.password)throw new GatewayError('version_not_found',404)
      if(request.headers.has('service-worker') || request.headers.get('sec-fetch-dest')==='serviceworker')throw new GatewayError('service_worker_forbidden',403)
      if(config.contentBase&&url.hostname===storageProbeHost(config.contentBase)){
        const probe=await storageProbeResponse(request,config);exchangeCookie=true;return finish(probe)
      }
      const identity=hostIdentity(url.hostname,config)
      if(identity.kind==='public')versionId=identity.id
      if(identity.kind==='stable'&&url.pathname===PUBLIC_BOOTSTRAP){
        if(request.method!=='GET'||url.search)throw new GatewayError('invalid_launch_request',400)
        return finish(publicBootstrap(config))
      }
      if(identity.kind==='stable'&&url.pathname===PUBLIC_EXCHANGE){
        if(request.method!=='POST'||url.search||request.headers.get('origin')!==url.origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new GatewayError('forbidden',403)
        const reader=request.body?.getReader();if(!reader)throw new GatewayError('invalid_launch_request',400)
        let text='',size=0;const decoder=new TextDecoder('utf8',{fatal:true})
        try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>256){await reader.cancel();throw new GatewayError('invalid_launch_request',400)}text+=decoder.decode(item.value,{stream:true})}text+=decoder.decode()}finally{reader.releaseLock()}
        let body:Record<string,unknown>;try{body=JSON.parse(text)}catch{throw new GatewayError('invalid_launch_request',400)}
        if(!body||typeof body!=='object'||Object.keys(body).length!==1||typeof body.ticket!=='string'||!/^[a-f0-9]{48}$/.test(body.ticket))throw new GatewayError('invalid_launch_request',400)
        const cookie=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join(''),previous=publicCookieValue(request)
        const session=await deps.db.call<{version_id:string;safe_context:{execution:'local'|'online'};delivery_cookie_reused?:boolean}>('distribution_exchange_versioned_public_delivery',{p_game:identity.id,p_ticket_hash:await sha256(new TextEncoder().encode(body.ticket)),p_cookie_hash:await sha256(new TextEncoder().encode(cookie)),p_previous_hash:previous?await sha256(new TextEncoder().encode(previous)):null})
        const version=await resolveGameVersion(session.version_id,deps.db)
        if(version.gameId!==identity.id)throw new GatewayError('version_not_found',404)
        const entry=version.entrypoints[session.safe_context.execution];if(!entry)throw new GatewayError('unsupported_execution',400)
        if(session.delivery_cookie_reused!==undefined&&typeof session.delivery_cookie_reused!=='boolean')throw new GatewayError('invalid_launch_session',503)
        if(session.delivery_cookie_reused&&!previous)throw new GatewayError('invalid_launch_session',503)
        const deliveryCookie=session.delivery_cookie_reused?previous!:cookie
        exchangeCookie=true
        return finish(Response.json({entrypoint:publicBuildPath(session.version_id,entry)},{headers:{'Set-Cookie':publicCookieHeader(deliveryCookie),'Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}}))
      }
      if(url.pathname==='/_preview/exchange') {
        if(identity.kind!=='preview')throw new GatewayError('artifact_not_found',404)
        if(request.method!=='POST')throw new GatewayError('unsupported_method',405)
        const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site')
        if(url.search || (origin?!config.portalOrigins.includes(origin):!!site && site!=='none'))throw new GatewayError('preview_forbidden',403)
        const exchanged=await previews.exchange(identity.id,await readTicket(request))
        const seconds=Math.min(900,Math.floor((Date.parse(exchanged.session.expires_at)-Date.now())/1000))
        if(seconds<=0)throw new GatewayError('preview_expired',403)
        versionId=exchanged.session.version_id;gameId=exchanged.launch.gameId
        response=new Response(null,{status:303,headers:{Location:exchanged.launch.entrypointUrl,'Cache-Control':'private, no-store',
          'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
          'Set-Cookie':`${PREVIEW_COOKIE}=${exchanged.cookie}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`}})
      } else {
        if(!['GET','HEAD'].includes(request.method))throw new GatewayError('unsupported_method',405)
        const pinned=identity.kind==='stable'?publicVersionRequest(request):null
        path=artifactRequestPath(request.url,true,pinned?.prefix)
        let execution:'local'|'online'|undefined
        pathSha256=await sha256(new TextEncoder().encode(path))
        if(identity.kind==='preview') {
          if(!previewFetchAllowed(request,url.origin,config.portalOrigins))throw new GatewayError('preview_forbidden',403)
          const session=await previews.authorize(identity.id,previewCookieValue(request.headers.get('cookie'),PREVIEW_COOKIE))
          versionId=session.version_id
          execution=session.execution
        }
        if(identity.kind==='launch') {
          const session=await launches!.authorize(identity.id)
          versionId=session.version_id;execution=session.safe_context.execution
        }
        if(identity.kind==='stable'){
          const cookie=publicCookieValue(request)
          const session=await deps.db.call<{version_id:string;safe_context:{execution:'local'|'online'}}>('distribution_check_versioned_public_delivery',{p_game:identity.id,p_version:pinned!.versionId,p_cookie_hash:cookie?await sha256(new TextEncoder().encode(cookie)):null})
          if(session.version_id!==pinned!.versionId)throw new GatewayError('launch_expired',403)
          versionId=session.version_id;execution=session.safe_context.execution
        }
        const version=await resolveGameVersion(versionId!,deps.db);gameId=version.gameId
        if(identity.kind==='stable'&&(version.gameId!==identity.id||version.status!=='published'))throw new GatewayError('version_not_found',404)
        if(identity.kind==='public' && version.status!=='published')throw new GatewayError('version_not_found',404)
        if(identity.kind==='preview' && !['draft','in_review','approved'].includes(version.status))throw new GatewayError('version_not_previewable',409)
        // Version prefix is verified by resolver. Only the client namespace exists
        // here: no route to inventory, original archives, staging or bucket root.
        const directory=path===''||path.endsWith('/')
        if(directory)path=path===''?(version.entrypoints[execution??'local']??version.entrypoints.online??'index.html'):path+'index.html'
        const key=version.storagePrefix+path,metadata=await deps.storage.head(key)
        if(!metadata)throw new GatewayError('artifact_not_found',404)
        if(!Number.isSafeInteger(metadata.size) || metadata.size<0 || !/^[a-f0-9]{64}$/.test(metadata.sha256))throw new GatewayError('storage_error',503)
        if(directory||(pinned&&!pinned.prefix)){const destination=new URL(pinned?publicBuildPath(pinned.versionId,path):'/'+path,url.origin);destination.search=url.search;return finish(new Response(null,{status:307,headers:{Location:destination.href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}}))}
        const media=artifactMedia(path),headers=gameSecurityHeaders(version.policy,config),etag=`"sha256-${metadata.sha256}"`
        if(pinned)headers.set('Referrer-Policy','same-origin')
        headers.set('Content-Type',media.contentType);headers.set('ETag',etag);headers.set('Accept-Ranges','bytes')
        if(media.contentEncoding)headers.set('Content-Encoding',media.contentEncoding)
        headers.set('Cache-Control',identity.kind!=='public'?'private, no-store':media.contentType.startsWith('text/html')?'public, no-cache':'public, max-age=31536000, immutable')
        if(identity.kind==='preview')headers.set('Vary','Cookie')
        const matches=request.headers.get('if-none-match')?.split(',').map(s=>s.trim()).some(s=>s==='*' || s===etag || s==='W/'+etag)
        if(identity.kind==='public' && matches)response=new Response(null,{status:304,headers})
        else {
          let range:ArtifactRange|undefined=undefined
          try {range=request.method==='GET' && (!request.headers.has('if-range') || request.headers.get('if-range')===etag)?parseByteRange(request.headers.get('range'),metadata.size):undefined}
          catch(error){if(error instanceof GatewayError && error.status===416){headers.set('Content-Range',`bytes */${metadata.size}`);headers.set('Cache-Control','private, no-store');headers.set('Content-Type','application/json');headers.delete('Content-Encoding');response=Response.json({error:{code:error.code}},{status:416,headers});return finish(response)}throw error}
          headers.set('Content-Length',String(range?.length ?? metadata.size))
          if(range)headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${metadata.size}`)
          const body=request.method==='HEAD'?null:await deps.storage.get(key,metadata,range)
          if(request.method!=='HEAD' && body===null)throw new GatewayError('artifact_not_found',404)
          response=new Response(body,{status:range?206:200,headers})
        }
      }
    } catch(error) {
      const safe=error instanceof GatewayError?error:error instanceof UploadError?new GatewayError(error.code,error.status):new GatewayError('storage_error',503)
      const headers:Record<string,string>={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"}
      if(safe.status===405)headers.Allow=new URL(request.url).pathname==='/_preview/exchange'?'POST':'GET, HEAD'
      response=Response.json({error:{code:safe.code}},{status:safe.status,headers})
    }
    return finish(response)
    function finish(result:Response) {
      if(config.contentBase) {
        if(!exchangeCookie)result.headers.delete('Set-Cookie')
        result.headers.set('Cache-Control','private, no-store')
        result.headers.set('CDN-Cache-Control','no-store')
        result.headers.set('Cloudflare-CDN-Cache-Control','no-store')
      }
      if(request.method==='HEAD' && result.body) {void result.body.cancel();result=new Response(null,{status:result.status,headers:result.headers})}
      result.headers.set('X-Request-Id',requestId)
      // An arbitrary requested path can itself contain a capability; only its digest is logged.
      try{deps.log?.({event:'artifact_request',requestId,...(gameId?{gameId}:{}),...(versionId?{gameVersionId:versionId}:{}),...(pathSha256?{pathSha256}:{}),status:result.status})}catch{}
      return result
    }
  }
}

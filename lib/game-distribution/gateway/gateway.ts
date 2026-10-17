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

type GatewayEvent={event:'artifact_request';requestId:string;gameId?:string;gameVersionId?:string;path?:string;status:number}
type Dependencies={db:UploadRepository;storage:ArtifactReader;log?:(event:GatewayEvent)=>void}
function hostIdentity(host:string,config:GatewayConfiguration) {
  const launch=new RegExp('^l-([a-f0-9]{48})\\.'+(config.contentBase ?? '').replaceAll('.','\\.')+'$').exec(host)
  if(config.contentBase && launch)return {kind:'launch' as const,id:launch[1]}
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
    const requestId=crypto.randomUUID();let gameId:string|undefined,versionId:string|undefined,path:string|undefined,response:Response
    try {
      const url=new URL(request.url)
      if(url.protocol!=='https:' || url.port || url.username || url.password)throw new GatewayError('version_not_found',404)
      const identity=hostIdentity(url.hostname,config)
      if(identity.kind==='public')versionId=identity.id
      if(request.headers.has('service-worker') || request.headers.get('sec-fetch-dest')==='serviceworker')throw new GatewayError('service_worker_forbidden',403)
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
        path=artifactRequestPath(request.url)
        if(identity.kind==='preview') {
          if(!previewFetchAllowed(request,url.origin,config.portalOrigins))throw new GatewayError('preview_forbidden',403)
          const session=await previews.authorize(identity.id,previewCookieValue(request.headers.get('cookie'),PREVIEW_COOKIE))
          versionId=session.version_id
        }
        if(identity.kind==='launch') {
          const session=await launches!.authorize(identity.id)
          versionId=session.version_id
        }
        const version=await resolveGameVersion(versionId!,deps.db);gameId=version.gameId
        if(identity.kind==='public' && version.status!=='published')throw new GatewayError('version_not_found',404)
        if(identity.kind==='preview' && !['draft','in_review','approved'].includes(version.status))throw new GatewayError('version_not_previewable',409)
        // Version prefix is verified by resolver. Only the client namespace exists
        // here: no route to inventory, original archives, staging or bucket root.
        const key=version.storagePrefix+path,metadata=await deps.storage.head(key)
        if(!metadata)throw new GatewayError('artifact_not_found',404)
        if(!Number.isSafeInteger(metadata.size) || metadata.size<0 || !/^[a-f0-9]{64}$/.test(metadata.sha256))throw new GatewayError('storage_error',503)
        const media=artifactMedia(path),headers=gameSecurityHeaders(version.policy,config),etag=`"sha256-${metadata.sha256}"`
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
      if(request.method==='HEAD' && result.body) {void result.body.cancel();result=new Response(null,{status:result.status,headers:result.headers})}
      result.headers.set('X-Request-Id',requestId)
      // Deliberately exclude raw URL/query, session ID, cookies, headers and body.
      try{deps.log?.({event:'artifact_request',requestId,...(gameId?{gameId}:{}),...(versionId?{gameVersionId:versionId}:{}),...(path?{path}:{}),status:result.status})}catch{}
      return result
    }
  }
}

import {GatewayError,type GatewayConfiguration} from './contracts'
import {UUID} from '../uploads/policy'
export const PUBLIC_GAME_COOKIE='__Host-cg-public'
export function publicCookieHeader(value:string,maxAge=86400){return `${PUBLIC_GAME_COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=None; Partitioned; Max-Age=${maxAge}`}
export const PUBLIC_BOOTSTRAP='/_launch/bootstrap'
export const PUBLIC_EXCHANGE='/_launch/exchange'
export const PUBLIC_BUILD_PREFIX='__chibasko_build__'
export function publicBuildPath(versionId:string,path:string){return `/${PUBLIC_BUILD_PREFIX}/${versionId}/${path}`}
export function publicVersionRequest(request:Request){
 const url=new URL(request.url)
 function identity(path:string){
  const match=new RegExp('^/'+PUBLIC_BUILD_PREFIX+'/([^/]+)(?:/|$)').exec(path)
  if(!match)return null
  if(!UUID.test(match[1]))throw new GatewayError('invalid_artifact_path',400)
  return {versionId:match[1].toLowerCase(),prefix:PUBLIC_BUILD_PREFIX+'/'+match[1]}
 }
 const direct=identity(url.pathname)
 if(direct)return direct
 // Le référent sert uniquement à router un chemin absolu du jeu. Il n'autorise
 // aucun accès : la version sera encore comparée à la session SQL et au cookie.
 const referrer=request.headers.get('referer')
 if(referrer){
  let source:URL;try{source=new URL(referrer)}catch{throw new GatewayError('invalid_artifact_path',400)}
  const context=source.origin===url.origin?identity(source.pathname):null
  if(context)return {versionId:context.versionId,prefix:''}
 }
 throw new GatewayError('launch_expired',403)
}
export function publicGameHost(gameId:string,base:string){return `g-${gameId.replaceAll('-','')}.${base}`}
export function publicGameIdentity(host:string,base:string){
 const match=new RegExp('^g-([a-f0-9]{32})\\.'+base.replaceAll('.','\\.')+'$').exec(host)
 if(!match)return null
 const h=match[1];return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
export function publicCookieValue(request:Request){
 const values=(request.headers.get('cookie')??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(PUBLIC_GAME_COOKIE+'='))
 if(values.length>1)throw new GatewayError('launch_expired',403)
 const value=values[0]?.slice(PUBLIC_GAME_COOKIE.length+1)
 if(value&&!/^[a-f0-9]{64}$/.test(value))throw new GatewayError('launch_expired',403)
 return value??null
}
export function publicBootstrap(config:GatewayConfiguration){
 // Le verrou navigateur sérialise aussi les premiers échanges sans cookie.
 // Les autorisations restent vérifiées par PostgreSQL, indépendamment de ce verrou.
 const nonce=crypto.randomUUID().replaceAll('-',''),portals=JSON.stringify(config.portalOrigins)
 const script=`addEventListener('load',async()=>{
 const p=new URLSearchParams(location.hash.slice(1)),parentOrigin=p.get('cgParent'),launchId=p.get('cgLaunch'),generation=p.get('cgGeneration'),ticket=p.get('ticket');
 history.replaceState(null,'',location.pathname);
 const origins=${portals};if(!origins.includes(parentOrigin)||parent===window)return;
 const fail=(type='failed')=>parent.postMessage({channel:'chibasko.delivery',type,launchId,generation},parentOrigin);
 const abort=new AbortController(),cancel=()=>abort.abort(),timer=setTimeout(cancel,15000);addEventListener('pagehide',cancel,{once:true});
 try{
  if(!navigator.locks)throw Error();
  await navigator.locks.request('chibasko-public-delivery',{signal:abort.signal},async()=>{
   const r=await fetch('${PUBLIC_EXCHANGE}',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket}),redirect:'error',signal:abort.signal});
   if(!r.ok){const error=await r.json().catch(()=>null);fail(error?.error?.code==='delivery_version_conflict'?'version_conflict':'failed');return}
   const data=await r.json(),u=new URL(data.entrypoint,location.origin);if(u.origin!==location.origin||u.search||u.hash||!u.pathname.endsWith('.html'))throw Error();
   const probe=await fetch(u,{method:'HEAD',credentials:'same-origin',cache:'no-store',redirect:'error',signal:abort.signal});if(!probe.ok)throw Error();
   u.hash=new URLSearchParams({cgLaunch:launchId,cgGeneration:generation,cgParent:parentOrigin});location.replace(u.href);
  });
 }catch{fail()}finally{clearTimeout(timer);removeEventListener('pagehide',cancel)}
});`

 return new Response(`<!doctype html><html lang="fr"><meta charset="utf-8"><title>Chargement du jeu</title><p>Préparation du jeu…</p><script nonce="${nonce}">${script}</script></html>`,{headers:{
  'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':`default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors ${config.portalOrigins.join(' ')}; base-uri 'none'; object-src 'none'; form-action 'none'`,
  'Origin-Agent-Cluster':'?1'
 }})
}

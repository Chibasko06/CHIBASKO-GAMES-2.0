import {getDomain} from 'tldts'

export const GAME_SANDBOX='allow-scripts allow-same-origin allow-pointer-lock'
const opaqueSandbox='allow-scripts allow-pointer-lock'
const loopback=(host:string)=>host==='localhost'||host==='127.0.0.1'||host==='[::1]'

/** Les URL du catalogue ne peuvent pas choisir les permissions du navigateur. */
export function legacyFramePolicy(value:unknown,parentOrigin:string){
  if(typeof value!=='string'||!value||value.length>4096||/[\u0000-\u0020\u007f\\]/.test(value))throw Error('invalid_game_url')
  const url=new URL(value),parent=new URL(parentOrigin)
  const local=loopback(parent.hostname)&&loopback(url.hostname)
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password
    ||(!local&&(!url.hostname.includes('.')||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(':')||url.hostname.endsWith('.localhost'))))throw Error('invalid_game_url')
  const site=getDomain(url.hostname,{allowPrivateDomains:true})??url.hostname
  const parentSite=getDomain(parent.hostname,{allowPrivateDomains:true})??parent.hostname
  // Une origine opaque empêche un contenu du même site d'accéder au portail.
  const sandbox=site===parentSite?opaqueSandbox:GAME_SANDBOX
  return {src:url.href,sandbox,allow:gameFramePermissions(url.origin),referrerPolicy:'no-referrer' as const}
}

export function gameFramePermissions(origin:string,isolated=false){
  return `fullscreen 'none'; autoplay ${origin}; gamepad ${origin}; cross-origin-isolated ${isolated?origin:"'none'"}; camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'`
}

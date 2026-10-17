import { getDomain, parse } from 'tldts'
import { createGameBridge } from './bridge'
import { objectWithKeys, safeContext, RuntimeError, RUNTIME_POLICY, type LaunchClient, type LaunchHandle, type LaunchRequest, type RuntimeState } from './contracts'

export const IFRAME_SANDBOX='allow-scripts allow-same-origin allow-pointer-lock'
export function validateLaunchHandle(value:unknown,request:LaunchRequest,parentOrigin:string):LaunchHandle {
  if(!objectWithKeys(value,['descriptor','controlToken']) || typeof value.controlToken!=='string' || !/^[a-f0-9]{64}$/.test(value.controlToken))throw new RuntimeError('invalid_descriptor')
  const h=value as LaunchHandle,d=h.descriptor
  const keys=['gameId','gameVersionId','integrationVersion','execution','entrypointUrl','capabilities','contentOrigin','launchId','generation','expiresAt','bridgeVersion','iframeProfile','context']
  if(!objectWithKeys(d,keys) || d.gameId!==request.gameId || d.gameVersionId!==request.gameVersionId || d.execution!==request.execution
    || d.bridgeVersion!==1 || d.integrationVersion!==1 || !/^[a-f0-9-]{36}$/.test(d.launchId) || !/^[a-f0-9-]{36}$/.test(d.generation)
    || !['web-v1','web-isolated-v1','web-legacy-v1'].includes(d.iframeProfile) || !safeContext(d.context)
    || d.context.gameId!==d.gameId || d.context.gameVersionId!==d.gameVersionId || d.context.execution!==d.execution)throw new RuntimeError('invalid_descriptor')
  const parent=new URL(parentOrigin),url=new URL(d.entrypointUrl),origin=new URL(d.contentOrigin)
  const suffix=parse(origin.hostname,{allowPrivateDomains:true})
  if(origin.origin!==d.contentOrigin || url.origin!==origin.origin || url.hash || url.search || url.username || url.password || origin.protocol!=='https:' || origin.port
    || !/^l-[a-f0-9]{48}\./.test(origin.hostname) || !suffix.isPrivate || suffix.publicSuffix!==origin.hostname.split('.').slice(1).join('.')
    || getDomain(parent.hostname,{allowPrivateDomains:true})===getDomain(origin.hostname,{allowPrivateDomains:true}))throw new RuntimeError('invalid_descriptor')
  if(!Number.isFinite(Date.parse(d.expiresAt)) || Date.parse(d.expiresAt)<=Date.now())throw new RuntimeError('launch_expired')
  return h
}
type Options={container:HTMLElement;request:LaunchRequest;client:LaunchClient;onState:(state:RuntimeState)=>void;onLeave:()=>void;policy?:Partial<typeof RUNTIME_POLICY>}
/** DOM host, reusable without React. A retry must create a completely new launch. */
export function mountGameRuntime(options:Options) {
  const {container,client,request}=options,host=container.ownerDocument.defaultView!,policy={...RUNTIME_POLICY,...options.policy},abort=new AbortController()
  let disposed=false,failed=false,handle:LaunchHandle|undefined,iframe:HTMLIFrameElement|undefined,bridge:ReturnType<typeof createGameBridge>|undefined
  let loadTimer:ReturnType<typeof setTimeout>|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined,loads=0
  const descriptorTimer=setTimeout(()=>fail('descriptor_timeout'),policy.descriptorMs)
  const state=(phase:RuntimeState['phase'],error?:string)=>{if(!disposed)options.onState({phase,...(error?{error}:{})})}
  const release=(h:LaunchHandle)=>{void client.release(h).catch(()=>{})}
  function detach(){clearTimeout(descriptorTimer);clearTimeout(loadTimer);clearTimeout(expiryTimer);abort.abort();bridge?.dispose();iframe?.remove();if(handle){release(handle);handle=undefined}}
  function fail(code:string){if(disposed || failed)return;failed=true;detach();state('failed',code)}
  function close(){if(disposed)return;detach();state('closed');disposed=true;options.onLeave()}
  state('resolving')
  void client.create(request,abort.signal).then(value=>{
    if(disposed || failed){release(value);return}
    clearTimeout(descriptorTimer)
    try{handle=validateLaunchHandle(value,request,host.location.origin)}catch(error){release(value);fail(error instanceof RuntimeError?error.code:'invalid_descriptor');return}
    state('launching')
    const d=handle.descriptor
    iframe=container.ownerDocument.createElement('iframe')
    iframe.title='Jeu Chibasko Games';iframe.setAttribute('sandbox',IFRAME_SANDBOX)
    // Only the host container may fullscreen, keeping its exit control visible.
    iframe.setAttribute('allow',`fullscreen 'none'; autoplay ${d.contentOrigin}; gamepad ${d.contentOrigin}; cross-origin-isolated ${d.contentOrigin}`)
    iframe.referrerPolicy='no-referrer';iframe.style.cssText='width:100%;height:100%;border:0;display:block;min-width:0'
    const src=new URL(d.entrypointUrl)
    src.hash=new URLSearchParams({cgLaunch:d.launchId,cgGeneration:d.generation,cgParent:host.location.origin}).toString()
    iframe.src=src.href
    iframe.addEventListener('load',()=>{if(disposed || failed)return;if(++loads>1){fail('unexpected_navigation');return}clearTimeout(loadTimer);bridge?.loaded()})
    iframe.addEventListener('error',()=>fail('iframe_error'))
    bridge=createGameBridge({host,source:()=>iframe?.contentWindow ?? null,descriptor:d,policy,
      onPhase:phase=>{clearTimeout(loadTimer);state(phase)},onFailure:fail,onLeave:close})
    loadTimer=setTimeout(()=>fail('iframe_load_timeout'),policy.loadMs)
    expiryTimer=setTimeout(()=>fail('launch_expired'),Math.max(0,Date.parse(d.expiresAt)-Date.now()))
    state('loading');container.replaceChildren(iframe)
  }).catch(()=>{if(!disposed && !failed)fail('launch_unavailable')})
  return {close,dispose(){if(disposed)return;detach();disposed=true},start(){bridge?.start()},stop(){bridge?.stop()}}
}

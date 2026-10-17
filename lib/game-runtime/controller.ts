import { getDomain, parse } from 'tldts'
import { createGameBridge } from './bridge'
import { objectWithKeys, safeContext, RuntimeError, RUNTIME_POLICY, runtimePolicy, type RuntimePolicy, type LaunchClient, type LaunchHandle, type LaunchRequest, type RuntimeState } from './contracts'

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
  if(Date.parse(d.expiresAt)>Date.now()+RUNTIME_POLICY.sessionSeconds*1000+5000)throw new RuntimeError('invalid_descriptor')
  return h
}
type Options={container:HTMLElement;request:LaunchRequest;client:LaunchClient;onState:(state:RuntimeState)=>void;onLeave:()=>void;policy?:Partial<RuntimePolicy>}
/** DOM host, reusable without React. A retry must create a completely new launch. */
export function mountGameRuntime(options:Options) {
  const {container,client,request}=options,host=container.ownerDocument.defaultView!,policy=runtimePolicy(options.policy),abort=new AbortController()
  let disposed=false,failed=false,handle:LaunchHandle|undefined,iframe:HTMLIFrameElement|undefined,bridge:ReturnType<typeof createGameBridge>|undefined
  let loadTimer:ReturnType<typeof setTimeout>|undefined,expiryTimer:ReturnType<typeof setTimeout>|undefined,leaseTimer:ReturnType<typeof setTimeout>|undefined,renewTimer:ReturnType<typeof setTimeout>|undefined,loads=0,expiresAt=0,renewing=false,renewAbort:AbortController|undefined
  const descriptorTimer=setTimeout(()=>fail('descriptor_timeout'),policy.descriptorMs)
  const state=(phase:RuntimeState['phase'],error?:string)=>{if(!disposed)options.onState({phase,...(error?{error}:{})})}
  const release=(h:LaunchHandle)=>{void client.release(h).catch(()=>{})}
  function detach(){clearTimeout(descriptorTimer);clearTimeout(loadTimer);clearTimeout(expiryTimer);clearTimeout(leaseTimer);clearTimeout(renewTimer);abort.abort();renewAbort?.abort();host.document.removeEventListener('visibilitychange',visibility);bridge?.dispose();iframe?.removeEventListener('load',loaded);iframe?.removeEventListener('error',iframeError);iframe?.remove();if(handle){release(handle);handle=undefined}}
  function fail(code:string){if(disposed || failed)return;failed=true;detach();state('failed',code)}
  function close(){if(disposed)return;detach();state('closed');disposed=true;options.onLeave()}
  function armLease(expires:string){expiresAt=Date.parse(expires);clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>fail('launch_expired'),Math.max(0,expiresAt-Date.now()));bridge?.renew(expires)}
  function scheduleRenew(delay=policy.leaseRenewMs){clearTimeout(leaseTimer);leaseTimer=setTimeout(()=>{void renew()},Math.min(delay,Math.max(policy.leaseRetryMs,(expiresAt-Date.now())/2)))}
  async function renew(){
    if(disposed || failed || !handle || renewing)return
    if(expiresAt<=Date.now()){fail('launch_expired');return}
    const current=handle;renewing=true;renewAbort=new AbortController()
    try {
      const lease=await Promise.race([client.renew(current,renewAbort.signal),new Promise<never>((_,reject)=>{
        renewTimer=setTimeout(()=>{renewAbort?.abort();reject(new RuntimeError('lease_request_timeout'))},policy.leaseRequestMs)
      })])
      if(disposed || failed || handle!==current)return
      if(!objectWithKeys(lease,['launchId','generation','expiresAt']) || lease.launchId!==current.descriptor.launchId || lease.generation!==current.descriptor.generation
        || typeof lease.expiresAt!=='string' || !Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt)<=Date.now()
        || Date.parse(lease.expiresAt)>Date.now()+policy.sessionSeconds*1000+5000){fail('invalid_lease');return}
      armLease(lease.expiresAt);scheduleRenew()
    } catch(error) {
      if(!disposed && !failed){if(error instanceof RuntimeError && error.code==='launch_expired')fail('launch_expired');else scheduleRenew(policy.leaseRetryMs)}
    } finally {clearTimeout(renewTimer);renewAbort=undefined;renewing=false}
  }
  function visibility(){if(!host.document.hidden && !disposed && !failed){if(expiresAt<=Date.now())fail('launch_expired');else void renew()}}
  function loaded(){if(disposed || failed)return;if(++loads>1){fail('unexpected_navigation');return}clearTimeout(loadTimer);bridge?.loaded()}
  function iframeError(){fail('iframe_error')}
  state('resolving')
  void client.create(request,abort.signal).then(value=>{
    if(disposed || failed){release(value);return}
    clearTimeout(descriptorTimer)
    try{handle=validateLaunchHandle(value,request,host.location.origin)}catch(error){handle=undefined;release(value);fail(error instanceof RuntimeError?error.code:'invalid_descriptor');return}
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
    iframe.addEventListener('load',loaded)
    iframe.addEventListener('error',iframeError)
    bridge=createGameBridge({host,source:()=>iframe?.contentWindow ?? null,descriptor:d,policy,
      onDocument:()=>clearTimeout(loadTimer),onPhase:phase=>{state(phase)},onFailure:fail,onLeave:close})
    loadTimer=setTimeout(()=>fail('iframe_load_timeout'),policy.loadMs)
    armLease(d.expiresAt);scheduleRenew();host.document.addEventListener('visibilitychange',visibility)
    state('loading');container.replaceChildren(iframe)
  }).catch(()=>{if(!disposed && !failed)fail('launch_unavailable')})
  return {close,dispose(){if(disposed)return;detach();disposed=true},start(){bridge?.start()},stop(){bridge?.stop()}}
}

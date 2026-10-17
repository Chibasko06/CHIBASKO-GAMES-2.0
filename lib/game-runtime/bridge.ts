import { BRIDGE_CHANNEL, RUNTIME_POLICY, validGameMessage, type RuntimeLaunchDescriptor, type RuntimePhase } from './contracts'

type Options={host:Window;source:()=>Window|null;descriptor:RuntimeLaunchDescriptor;onPhase:(phase:RuntimePhase)=>void;onFailure:(code:string)=>void;onLeave:()=>void;policy?:Partial<typeof RUNTIME_POLICY>}
/** Host-side browser transport only. No React, auth or gameplay protocol. */
export function createGameBridge(options:Options) {
  const {host,descriptor:d}=options,policy={...RUNTIME_POLICY,...options.policy}
  let disposed=false,documentId='',ready=false,running=false,sequence=0,pending=0,deadline=0
  let handshake:ReturnType<typeof setTimeout>|undefined
  function loaded(){if(!disposed && !ready && !handshake)handshake=setTimeout(()=>fail('handshake_timeout'),policy.handshakeMs)}
  const send=(type:string,payload:Record<string,unknown>)=>options.source()?.postMessage({channel:BRIDGE_CHANNEL,protocolVersion:1,launchId:d.launchId,generation:d.generation,type,payload},d.contentOrigin)
  const fail=(code:string)=>{if(disposed)return;dispose();options.onFailure(code)}
  function start(){if(disposed || !ready || running)return;if(Date.parse(d.expiresAt)<=Date.now()){fail('launch_expired');return}running=true;send('GAMEPLAY_START',{documentId});options.onPhase('running')}
  function stop(){if(disposed || !running)return;running=false;send('GAMEPLAY_STOP',{documentId});options.onPhase('ready')}
  function ping(){if(disposed || !ready || host.document.hidden)return
    if(pending && Date.now()>deadline){fail('bridge_lost');return}
    if(!pending){pending=++sequence;deadline=Date.now()+policy.pongMs;send('PLATFORM_PING',{documentId,sequence:pending})}}
  function receive(event:MessageEvent) {
    if(disposed || event.source!==options.source() || event.origin!==d.contentOrigin || !validGameMessage(event.data))return
    const message=event.data
    if(message.launchId!==d.launchId || message.generation!==d.generation)return
    if(Date.parse(d.expiresAt)<=Date.now()){fail('launch_expired');return}
    const doc=String(message.payload.documentId)
    if(message.type==='GAME_HELLO') {
      if(documentId && documentId!==doc){fail('unexpected_navigation');return}
      if(documentId===doc)return
      documentId=doc
      loaded()
      if(!ready)send('PLATFORM_INIT',{documentId,context:d.context})
      return
    }
    if(!documentId || documentId!==doc)return
    if(message.type==='GAME_READY') {
      if(ready)return
      ready=true;clearTimeout(handshake);options.onPhase('ready');if(!host.document.hidden)start();return
    }
    if(message.type==='GAME_ERROR'){fail('game_error');return}
    if(!ready)return
    if(message.type==='LEAVE_REQUEST'){options.onLeave();return}
    if(message.type==='GAME_PONG' && message.payload.sequence===pending){pending=0;deadline=0}
  }
  function visibility(){pending=0;deadline=0;if(host.document.hidden)stop();else{start();ping()}}
  function dispose(){if(disposed)return;disposed=true;clearTimeout(handshake);clearInterval(heartbeat);host.removeEventListener('message',receive);host.document.removeEventListener('visibilitychange',visibility)}
  host.addEventListener('message',receive)
  host.document.addEventListener('visibilitychange',visibility)
  const heartbeat=setInterval(ping,Math.min(policy.pingMs,policy.pongMs))
  return {start,stop,loaded,dispose}
}

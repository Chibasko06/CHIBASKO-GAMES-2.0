import { BRIDGE_CHANNEL, runtimePolicy, validGameMessage, type RuntimePolicy, type RuntimeLaunchDescriptor, type RuntimePhase } from './contracts'

type Options={host:Window;source:()=>Window|null;descriptor:RuntimeLaunchDescriptor;onPhase:(phase:RuntimePhase)=>void;onFailure:(code:string)=>void;onLeave:()=>void;onDocument?:()=>void;policy?:Partial<RuntimePolicy>}
/** Independent document, HELLO/INIT acknowledgement and game-ready budgets.
 * PONG acknowledges INIT without introducing a new wire message. */
export function createGameBridge(options:Options) {
  const {host,descriptor:d}=options,policy=runtimePolicy(options.policy)
  let disposed=false,documentId='',connected=false,ready=false,running=false,sequence=0,pending=0,deadline=0,expiresAt=Date.parse(d.expiresAt)
  let helloTimer:ReturnType<typeof setTimeout>|undefined,handshakeTimer:ReturnType<typeof setTimeout>|undefined,readyTimer:ReturnType<typeof setTimeout>|undefined
  const fail=(code:string)=>{if(disposed)return;dispose();options.onFailure(code)}
  function active(){if(disposed)return false;if(expiresAt<=Date.now()){fail('launch_expired');return false}return true}
  function send(type:string,payload:Record<string,unknown>) {
    try{const source=options.source();if(!source){fail('bridge_lost');return false}
      source.postMessage({channel:BRIDGE_CHANNEL,protocolVersion:1,launchId:d.launchId,generation:d.generation,type,payload},d.contentOrigin);return true
    }catch{fail('bridge_lost');return false}
  }
  function loaded(){if(active() && !documentId && !helloTimer)helloTimer=setTimeout(()=>fail('hello_timeout'),policy.helloMs)}
  function acknowledge(){if(disposed || connected)return;connected=true;clearTimeout(handshakeTimer)
    readyTimer=setTimeout(()=>fail('game_ready_timeout'),policy.gameReadyMs)}
  function start(){if(!active() || !ready || running)return;running=true;if(send('GAMEPLAY_START',{documentId}))options.onPhase('running')}
  function stop(){if(disposed || !running)return;running=false;if(send('GAMEPLAY_STOP',{documentId}))options.onPhase('ready')}
  function ping(force=false){if(!active() || !documentId || (host.document.hidden && !force))return
    if(pending && Date.now()>=deadline){fail('bridge_lost');return}
    if(!pending){pending=++sequence;deadline=Date.now()+policy.pongMs;send('PLATFORM_PING',{documentId,sequence:pending})}}
  function receive(event:MessageEvent) {
    if(disposed || event.source!==options.source() || event.origin!==d.contentOrigin || !validGameMessage(event.data))return
    const message=event.data
    if(message.launchId!==d.launchId || message.generation!==d.generation || !active())return
    const doc=String(message.payload.documentId)
    if(message.type==='GAME_HELLO') {
      if(documentId && documentId!==doc){fail('unexpected_navigation');return}
      if(documentId===doc)return
      documentId=doc;clearTimeout(helloTimer);options.onDocument?.()
      if(disposed)return
      handshakeTimer=setTimeout(()=>fail('handshake_timeout'),policy.handshakeMs)
      if(send('PLATFORM_INIT',{documentId,context:d.context}))ping(true)
      return
    }
    if(!documentId || documentId!==doc)return
    if(message.type==='GAME_PONG' && pending && message.payload.sequence===pending){pending=0;deadline=0;acknowledge();return}
    if(message.type==='GAME_READY') {
      if(ready)return
      acknowledge();ready=true;clearTimeout(readyTimer);options.onPhase('ready');if(!host.document.hidden)start();return
    }
    if(message.type==='GAME_ERROR'){fail('game_error');return}
    if(ready && message.type==='LEAVE_REQUEST')options.onLeave()
  }
  function visibility(){if(connected){pending=0;deadline=0}if(host.document.hidden)stop();else{start();ping()}}
  function dispose(){if(disposed)return;disposed=true;clearTimeout(helloTimer);clearTimeout(handshakeTimer);clearTimeout(readyTimer);clearInterval(heartbeat);host.removeEventListener('message',receive);host.document.removeEventListener('visibilitychange',visibility)}
  host.addEventListener('message',receive)
  host.document.addEventListener('visibilitychange',visibility)
  const heartbeat=setInterval(ping,Math.min(policy.pingMs,policy.pongMs))
  return {start,stop,loaded,dispose,renew(expires:string){if(!disposed)expiresAt=Date.parse(expires)}}
}

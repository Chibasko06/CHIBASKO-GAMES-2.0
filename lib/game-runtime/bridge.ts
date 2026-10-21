import {DEFAULT_AUDIO,safeAudio,type PlayerAudioState} from './audio'
import { BRIDGE_CHANNEL, objectWithKeys, runtimePolicy, validGameMessage, type RuntimePolicy, type RuntimeLaunchDescriptor, type RuntimePhase } from './contracts'
import type { GameStartContext } from '../online-session/contracts'

type Options={getAudioState?:()=>PlayerAudioState;onAudioSupport?:(supported:boolean)=>void;host:Window;source:()=>Window|null;descriptor:RuntimeLaunchDescriptor;onPhase:(phase:RuntimePhase)=>void;onFailure:(code:string)=>void;onLeave:()=>void;onDocument?:()=>void;policy?:Partial<RuntimePolicy>;getStartContext?:()=>Promise<GameStartContext>}
/** Independent document, HELLO/INIT acknowledgement and game-ready budgets.
 * PONG acknowledges INIT without introducing a new wire message. */
export function createGameBridge(options:Options) {
  const {host,descriptor:d}=options,policy=runtimePolicy(options.policy)
  let disposed=false,documentId='',connected=false,ready=false,running=false,sequence=0,pending=0,deadline=0,expiresAt=Date.parse(d.expiresAt)
  let helloTimer:ReturnType<typeof setTimeout>|undefined,handshakeTimer:ReturnType<typeof setTimeout>|undefined,readyTimer:ReturnType<typeof setTimeout>|undefined
  let audioSupported=false
  function updateAudio(){if(active()&&documentId&&audioSupported){const state=safeAudio(options.getAudioState?.()??DEFAULT_AUDIO);if(state)send('PLATFORM_AUDIO_STATE',{documentId,state})}}
  let protocol:1|2=1,starting=false,wanted=false,everStarted=false,startContext:GameStartContext|undefined,startTimer:ReturnType<typeof setTimeout>|undefined
  const fail=(code:string)=>{if(disposed)return;dispose();options.onFailure(code)}
  function active(){if(disposed)return false;if(expiresAt<=Date.now()){fail('launch_expired');return false}return true}
  function send(type:string,payload:Record<string,unknown>) {
    try{const source=options.source();if(!source){fail('bridge_lost');return false}
      source.postMessage({channel:BRIDGE_CHANNEL,protocolVersion:protocol,launchId:d.launchId,generation:d.generation,type,payload},d.contentOrigin);return true
    }catch{fail('bridge_lost');return false}
  }
  function loaded(){if(active() && !documentId && !helloTimer)helloTimer=setTimeout(()=>fail('hello_timeout'),policy.helloMs)}
  function acknowledge(){if(disposed || connected)return;connected=true;clearTimeout(handshakeTimer)
    readyTimer=setTimeout(()=>fail('game_ready_timeout'),policy.gameReadyMs)}
  function deliverStart(){if(!active() || !wanted || host.document.hidden || running)return;running=true;everStarted=true
    if(send('GAMEPLAY_START',{documentId,...(protocol===2?{context:startContext}:{})}))options.onPhase('running')}
  function start(){
    if(!active() || !ready || running || starting || host.document.hidden)return
    wanted=true
    if(!everStarted && startContext?.execution==='online' && Date.parse(startContext.online.server.expiresAt)<=Date.now())startContext=undefined
    if(protocol===1){deliverStart();return}
    if(d.context.execution==='local'){startContext={execution:'local'};deliverStart();return}
    if(startContext){deliverStart();return}
    if(!options.getStartContext){fail('online_session_unavailable');return}
    starting=true;startTimer=setTimeout(()=>fail('start_timeout'),policy.descriptorMs)
    void options.getStartContext().then(context=>{
      if(!active())return
      if(!objectWithKeys(context,['execution','online']) || context.execution!=='online'
        || !objectWithKeys(context.online,['onlineSessionId','participantId','server'])
        || !objectWithKeys(context.online.server,['endpoint','ticket','expiresAt']) || context.online.onlineSessionId!==d.context.session?.sessionId
        || !d.context.session.localParticipantIds.includes(context.online.participantId)
        || !/^[a-f0-9]{64}$/.test(context.online.server.ticket) || Date.parse(context.online.server.expiresAt)<=Date.now()
        || !Number.isFinite(Date.parse(context.online.server.expiresAt))) {fail('invalid_start_context');return}
      const endpoint=new URL(context.online.server.endpoint)
      if(!['https:','wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash){fail('invalid_start_context');return}
      startContext=context;deliverStart()
    }).catch(()=>{if(!disposed)fail('online_session_unavailable')}).finally(()=>{starting=false;clearTimeout(startTimer)})
  }
  function stop(){wanted=false;if(disposed || !running)return;running=false;if(send('GAMEPLAY_STOP',{documentId}))options.onPhase('ready')}
  function ping(force=false){if(!active() || !documentId || (host.document.hidden && !force))return
    if(pending && Date.now()>=deadline){fail('bridge_lost');return}
    if(!pending){pending=++sequence;deadline=Date.now()+policy.pongMs;send('PLATFORM_PING',{documentId,sequence:pending})}}
  function receive(event:MessageEvent) {
    if(disposed || event.source!==options.source() || event.origin!==d.contentOrigin || !validGameMessage(event.data))return
    const message=event.data
    if(message.launchId!==d.launchId || message.generation!==d.generation || !active())return
    const doc=String(message.payload.documentId)
    if(message.type==='GAME_HELLO') {
      if(message.protocolVersion>(d.bridgeVersion ?? 2))return
      if(documentId && documentId!==doc){fail('unexpected_navigation');return}
      if(documentId===doc)return
      if(message.protocolVersion===1 && d.context.participants.length>64){fail('protocol_mismatch');return}
      protocol=message.protocolVersion
      documentId=doc;clearTimeout(helloTimer);options.onDocument?.()
      if(disposed)return
      handshakeTimer=setTimeout(()=>fail('handshake_timeout'),policy.handshakeMs)
      if(send('PLATFORM_INIT',{documentId,context:d.context}))ping(true)
      return
    }
    if(message.protocolVersion!==protocol)return
    if(!documentId || documentId!==doc)return
    if(message.type==='GAME_AUDIO_SUPPORT'){audioSupported=message.payload.supported===true;options.onAudioSupport?.(audioSupported);if(audioSupported)updateAudio();return}
    if(message.type==='GAME_PONG' && pending && message.payload.sequence===pending){pending=0;deadline=0;acknowledge();return}
    if(message.type==='GAME_READY') {
      if(ready)return
      acknowledge();ready=true;clearTimeout(readyTimer);options.onPhase('ready');if(!host.document.hidden)start();return
    }
    if(message.type==='GAME_ERROR'){fail('game_error');return}
    if(ready && message.type==='LEAVE_REQUEST')options.onLeave()
  }
  function visibility(){if(connected){pending=0;deadline=0}if(host.document.hidden)stop();else{start();ping()}}
  function dispose(){if(disposed)return;disposed=true;audioSupported=false;options.onAudioSupport?.(false);clearTimeout(startTimer);clearTimeout(helloTimer);clearTimeout(handshakeTimer);clearTimeout(readyTimer);clearInterval(heartbeat);host.removeEventListener('message',receive);host.document.removeEventListener('visibilitychange',visibility)}
  host.addEventListener('message',receive)
  host.document.addEventListener('visibilitychange',visibility)
  const heartbeat=setInterval(ping,Math.min(policy.pingMs,policy.pongMs))
  return {start,stop,loaded,dispose,updateAudio,renew(expires:string){if(!disposed)expiresAt=Date.parse(expires)}}
}

// Test game stub, NOT a vendored SDK or a production browser adapter.
(() => {
  const hash=new URLSearchParams(location.hash.slice(1)),documentId=crypto.randomUUID(),parentOrigin=hash.get('cgParent')
  if(!parentOrigin)return
  const behavior=document.body.dataset.behavior
  const envelope={channel:'chibasko.game',protocolVersion:behavior==='audio'?2:1,launchId:hash.get('cgLaunch'),generation:hash.get('cgGeneration')}
  const send=(type,extra={})=>parent.postMessage({...envelope,type,payload:{documentId,...extra}},parentOrigin)
  window.fixture={context:null,starts:0,stops:0,pings:0,send,envelope,documentId}
  window.addEventListener('message',event=>{
    if(event.source!==parent || event.origin!==parentOrigin)return
    const m=event.data
    if(!m || m.channel!==envelope.channel || m.protocolVersion!==envelope.protocolVersion || m.launchId!==envelope.launchId || m.generation!==envelope.generation || m.payload.documentId!==documentId)return
    if(m.type==='PLATFORM_AUDIO_STATE')window.fixture.audio=m.payload.state
    if(m.type==='PLATFORM_INIT') {if(behavior==='audio')send('GAME_AUDIO_SUPPORT',{supported:true});window.fixture.context=m.payload.context;if(behavior==='slow-assets')setTimeout(()=>send('GAME_READY'),90_000);else if(!['never-ready','loading-no-pong','no-init-ack'].includes(behavior))send('GAME_READY')}
    if(m.type==='GAMEPLAY_START')window.fixture.starts++
    if(m.type==='GAMEPLAY_STOP')window.fixture.stops++
    if(m.type==='PLATFORM_PING'){window.fixture.pings++;if(!['no-pong','no-init-ack'].includes(behavior) && (behavior!=='loading-no-pong' || m.payload.sequence===1))send('GAME_PONG',{sequence:m.payload.sequence})}
  })
  if(behavior!=='no-sdk')send('GAME_HELLO')
})()

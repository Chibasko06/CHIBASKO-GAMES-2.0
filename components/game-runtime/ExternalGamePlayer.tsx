'use client'

import {useEffect,useRef,useState} from 'react'
import {externalFramePolicy} from '@/lib/game-runtime/iframePolicy'
import GameLauncher from './GameLauncher'
import GamePlayerShell from './GamePlayerShell'
import GamePlayerError from './GamePlayerError'
import PlayerFrame,{legacyViewport} from './PlayerFrame'
import PreviewManualChecks from './PreviewManualChecks'
import styles from './GameRuntime.module.css'

type Props = {title:string;coverUrl?:string|null;developerName?:string|null} &
  ({gameId:string;revisionId?:never;token?:never}|{gameId?:never;revisionId:string;token:string})
type Phase = 'launcher'|'launching'|'playing'|'error'

export default function ExternalGamePlayer({title,coverUrl,developerName,gameId,revisionId,token}:Props){
  const [phase,setPhase]=useState<Phase>('launcher')
  const [frame,setFrame]=useState<{policy:ReturnType<typeof externalFramePolicy>;revisionId:string}|null>(null)
  const request=useRef<AbortController|null>(null)
  const preview=Boolean(revisionId)
  useEffect(()=>()=>request.current?.abort(),[gameId,revisionId,token])

  useEffect(()=>{
    if(phase!=='launching'||!frame)return
    const timeout=setTimeout(()=>setPhase('error'),20_000)
    return()=>clearTimeout(timeout)
  },[phase,frame])

  function close(){
    request.current?.abort()
    request.current=null
    setFrame(null)
    setPhase('launcher')
  }

  async function launch(){
    request.current?.abort()
    const controller=new AbortController()
    request.current=controller
    setFrame(null)
    setPhase('launching')
    const endpoint=revisionId
      ? '/api/developer/submissions/external/'+encodeURIComponent(revisionId)+'/preview'
      : '/api/games/'+encodeURIComponent(gameId!)+'/external-launch'
    const timeout=setTimeout(()=>controller.abort(),10_000)
    try{
      const response=await fetch(endpoint,{cache:'no-store',credentials:'omit',signal:controller.signal,
        headers:token?{Authorization:'Bearer '+token}:undefined})
      if(!response.ok)throw Error('external_launch_unavailable')
      const {data}=await response.json()
      if(typeof data?.revisionId!=='string'||(revisionId&&data.revisionId!==revisionId))throw Error('invalid_revision')
      const policy=externalFramePolicy(data.url)
      if(!controller.signal.aborted)setFrame({policy,revisionId:data.revisionId})
    }catch{
      if(request.current===controller)setPhase('error')
    }finally{
      clearTimeout(timeout)
    }
  }

  return <div className="space-y-3">
    <GamePlayerShell presentation="legacy" phase={phase} canLeave={phase!=='launcher'} onLeave={close}>
      {phase==='launcher'&&<GameLauncher title={title} coverUrl={coverUrl} developerName={developerName}
        actions={[{id:'play',label:preview?'Lancer la prévisualisation':'Jouer',available:true}]} onPlay={()=>void launch()}/>}
      {frame&&(phase==='launching'||phase==='playing')&&<PlayerFrame viewport={legacyViewport}>
        <iframe title={preview?'Prévisualisation du jeu externe':'Jeu HTML5 externe'} {...frame.policy}
          className={styles.legacyFrame} onLoad={()=>setPhase('playing')} onError={()=>setPhase('error')}/>
      </PlayerFrame>}
      {phase==='launching'&&<div className={styles.overlay}><p role="status" className={styles.message}>Chargement du jeu externe…</p></div>}
      {phase==='error'&&<GamePlayerError message="Le lancement ou le chargement du jeu externe a échoué ou dépassé le délai prévu."
        onRetry={()=>void launch()} onBack={close}/>}
    </GamePlayerShell>
    {preview&&<>
      {frame&&<p className="break-all text-sm">Révision {frame.revisionId} · URL enregistrée {frame.policy.src}</p>}
      <p role="status" className="text-sm">{phase==='playing'
        ? 'Événement de chargement reçu. Le fonctionnement du jeu reste à vérifier.'
        : phase==='error'?'Échec observable du lancement ou délai dépassé.':'Fonctionnement du jeu non vérifié.'}</p>
      <p className="text-sm text-zinc-400">Les redirections, la destination finale, les en-têtes d’intégration et les ressources internes ne sont pas vérifiés par le lecteur.</p>
      <PreviewManualChecks external/>
    </>}
  </div>
}

'use client'
import { useEffect, useRef, useState } from 'react'
import { mountGameRuntime } from '@/lib/game-runtime/controller'
import { httpLaunchClient } from '@/lib/game-runtime/client'
import type { LaunchClient, LaunchRequest, RuntimeState } from '@/lib/game-runtime/contracts'
import styles from './GameRuntime.module.css'

const defaultClient=httpLaunchClient()
type Props=LaunchRequest & {onLeave:()=>void;client?:LaunchClient}
/** Built Web artifacts only. The legacy module player remains outside this runtime. */
export default function GameRuntime({gameId,gameVersionId,execution,audience,locale,onlineSessionReference,onLeave,client=defaultClient}:Props) {
  const container=useRef<HTMLDivElement>(null),shell=useRef<HTMLElement>(null),leave=useRef(onLeave)
  const controller=useRef<ReturnType<typeof mountGameRuntime>|null>(null)
  const [state,setState]=useState<RuntimeState>({phase:'resolving'}),[attempt,setAttempt]=useState(0),[fullscreenError,setFullscreenError]=useState(false)
  useEffect(()=>{leave.current=onLeave},[onLeave])
  useEffect(()=>{
    const runtime=mountGameRuntime({container:container.current!,request:{gameId,gameVersionId,execution,audience,locale,onlineSessionReference},client,onState:setState,onLeave:()=>leave.current()})
    controller.current=runtime
    return()=>{runtime.dispose();controller.current=null}
  },[gameId,gameVersionId,execution,audience,locale,onlineSessionReference,client,attempt])
  const busy=['resolving','launching','loading'].includes(state.phase)
  async function fullscreen(){try{await shell.current?.requestFullscreen();setFullscreenError(false)}catch{setFullscreenError(true)}}
  return <section ref={shell} className={styles.shell} aria-label="Jeu Chibasko Games" data-phase={state.phase}>
    <div className={styles.toolbar}>
      <button type="button" onClick={()=>controller.current?.close()}>Quitter le jeu</button>
      <button type="button" onClick={fullscreen} disabled={state.phase==='closed'}>Plein écran</button>
      <span role="status" aria-live="polite">{busy?'Chargement du jeu…':state.phase==='running'?'Partie en cours':state.phase==='ready'?'Jeu prêt':state.phase==='closed'?'Jeu fermé':''}</span>
    </div>
    {fullscreenError?<p role="status">Le plein écran n’est pas disponible. Tu peux continuer ici.</p>:null}
    {state.phase==='failed'?<div className={styles.error} role="alert"><p>{state.error==='handshake_timeout'?'Le jeu n’a pas terminé son initialisation.':'Le jeu ne peut pas continuer pour le moment.'}</p><button type="button" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></div>:null}
    <div ref={container} className={styles.viewport} aria-busy={busy}/>
  </section>
}

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
    <div className={styles.controls}>
      <button type="button" aria-label="Plein écran" title="Plein écran" onClick={fullscreen} disabled={state.phase==='closed'}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>
        <span className={styles.tooltip} aria-hidden="true">Plein écran</span>
      </button>
      <button type="button" aria-label="Quitter le jeu" title="Quitter le jeu" onClick={()=>controller.current?.close()}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>
        <span className={styles.tooltip} aria-hidden="true">Quitter le jeu</span>
      </button>
    </div>
    <div ref={container} className={styles.viewport} aria-busy={busy}/>
    {busy?<div className={styles.overlay}><p className={styles.message} role="status" aria-live="polite">Chargement du jeu…</p></div>:null}
    {state.phase==='failed'?<div className={styles.overlay}><div className={styles.message} role="alert"><p>{state.error==='launch_expired'?'La session de jeu a expiré.': ['hello_timeout','handshake_timeout','game_ready_timeout'].includes(state.error ?? '')?'Le jeu n’a pas terminé son initialisation.':'Le jeu ne peut pas continuer pour le moment.'}</p><button className={styles.retry} type="button" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></div></div>:null}
    {state.phase==='closed'?<div className={styles.overlay}><p className={styles.message} role="status">Jeu fermé</p></div>:null}
    {fullscreenError?<p className={styles.notice} role="status">Le plein écran n’est pas disponible. Tu peux continuer ici.</p>:null}
  </section>
}

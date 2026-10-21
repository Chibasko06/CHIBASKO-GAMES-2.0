'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { mountGameRuntime } from '@/lib/game-runtime/controller'
import { httpLaunchClient } from '@/lib/game-runtime/client'
import type { LaunchClient, LaunchRequest, RuntimeState } from '@/lib/game-runtime/contracts'
import styles from './GameRuntime.module.css'
import PlayerIcon from './PlayerIcon'

const defaultClient=httpLaunchClient()
type Props=LaunchRequest & {onLeave:()=>void;client?:LaunchClient;socialControls?:ReactNode;audioControl?:{muted:boolean;onToggle:()=>void;disabled?:boolean}}
/** Built Web artifacts only. The legacy module player remains outside this runtime. */
export default function GameRuntime({gameId,gameVersionId,execution,audience,locale,onlineSessionReference,onLeave,client=defaultClient,socialControls,audioControl}:Props) {
  const container=useRef<HTMLDivElement>(null),shell=useRef<HTMLElement>(null),leave=useRef(onLeave)
  const controller=useRef<ReturnType<typeof mountGameRuntime>|null>(null)
  const [state,setState]=useState<RuntimeState>({phase:'resolving'}),[attempt,setAttempt]=useState(0),[fullscreenError,setFullscreenError]=useState(false)
  const [isFullscreen,setIsFullscreen]=useState(false)
  useEffect(()=>{
    const document=shell.current!.ownerDocument
    const sync=()=>setIsFullscreen(document.fullscreenElement===shell.current)
    document.addEventListener('fullscreenchange',sync)
    return()=>document.removeEventListener('fullscreenchange',sync)
  },[])
  useEffect(()=>{leave.current=onLeave},[onLeave])
  useEffect(()=>{
    const runtime=mountGameRuntime({container:container.current!,request:{gameId,gameVersionId,execution,audience,locale,onlineSessionReference},client,onState:setState,onLeave:()=>leave.current()})
    controller.current=runtime
    return()=>{runtime.dispose();controller.current=null}
  },[gameId,gameVersionId,execution,audience,locale,onlineSessionReference,client,attempt])
  const busy=['resolving','launching','loading'].includes(state.phase)
  async function fullscreen(){const element=shell.current;if(!element)return;try{if(element.ownerDocument.fullscreenElement===element)await element.ownerDocument.exitFullscreen();else await element.requestFullscreen();setFullscreenError(false)}catch{setFullscreenError(true)}}
  const fullscreenLabel=isFullscreen?'Quitter le plein écran':'Plein écran'
  const audioLabel=audioControl && !audioControl.disabled?(audioControl.muted?'Réactiver le son':'Couper le son'):'Contrôle audio indisponible pour ce jeu'
  return <section ref={shell} className={styles.shell} aria-label="Jeu Chibasko Games" data-phase={state.phase}>
    <div className={styles.dock} role="group" aria-label="Commandes du lecteur">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.logo} src="/logo-chibaskogames-rond.ico" alt="Chibasko Games" width="28" height="28"/>
      <div className={styles.reactions} role="group" aria-label="Réactions au jeu">
        {socialControls ?? <>{(['like','dislike','favorite'] as const).map((name,index)=><button className={styles.iconButton} type="button" key={name} disabled aria-label={['J’aime','Je n’aime pas','Favori'][index]} title="Réactions indisponibles dans ce lecteur"><PlayerIcon name={name}/></button>)}</>}
      </div>
      <div className={styles.actions}>
        <span className={styles.control} tabIndex={!audioControl || audioControl.disabled?0:undefined} role="group" aria-label={!audioControl || audioControl.disabled?audioLabel:undefined}>
          <button className={styles.iconButton} type="button" aria-label={audioLabel} title={audioLabel} aria-pressed={audioControl?.muted} disabled={!audioControl || audioControl.disabled} onClick={audioControl?.onToggle}><PlayerIcon name={!audioControl || audioControl.muted?'muted':'volume'}/></button>
          <span className={styles.tooltip} aria-hidden="true">{audioLabel}</span>
        </span>
        <button className={styles.iconButton} type="button" aria-label={fullscreenLabel} title={fullscreenLabel} aria-pressed={isFullscreen} onClick={fullscreen} disabled={state.phase==='closed'}><PlayerIcon name={isFullscreen?'restore':'fullscreen'}/><span className={styles.tooltip} aria-hidden="true">{fullscreenLabel}</span></button>
        <button className={styles.iconButton} type="button" aria-label="Quitter le jeu" title="Quitter le jeu" onClick={()=>controller.current?.close()}><PlayerIcon name="close"/><span className={styles.tooltip} aria-hidden="true">Quitter le jeu</span></button>
      </div>
    </div>
    <div ref={container} className={styles.viewport} aria-busy={busy}/>
    {busy?<div className={styles.overlay}><p className={styles.message} role="status" aria-live="polite">Chargement du jeu…</p></div>:null}
    {state.phase==='failed'?<div className={styles.overlay}><div className={styles.message} role="alert"><p>{state.error==='launch_expired'?'La session de jeu a expiré.': ['hello_timeout','handshake_timeout','game_ready_timeout'].includes(state.error ?? '')?'Le jeu n’a pas terminé son initialisation.':'Le jeu ne peut pas continuer pour le moment.'}</p><button className={styles.retry} type="button" onClick={()=>setAttempt(n=>n+1)}>Réessayer</button></div></div>:null}
    {state.phase==='closed'?<div className={styles.overlay}><p className={styles.message} role="status">Jeu fermé</p></div>:null}
    {fullscreenError?<p className={styles.notice} role="status">Le plein écran n’est pas disponible. Tu peux continuer ici.</p>:null}
  </section>
}

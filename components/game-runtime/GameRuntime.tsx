'use client'
import {usePlayerAudio} from './usePlayerAudio'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import {mountGameRuntime} from '@/lib/game-runtime/controller'
import {httpLaunchClient} from '@/lib/game-runtime/client'
import type {LaunchClient,LaunchRequest,RuntimeState,IntegrationObservation} from '@/lib/game-runtime/contracts'
import GamePlayerShell,{type PlayerAudioControl} from './GamePlayerShell'
import styles from './GameRuntime.module.css'
import GamePlayerError from './GamePlayerError'
import PlayerFrame,{type PlayerViewport} from './PlayerFrame'
const defaultClient=httpLaunchClient()
type Props=LaunchRequest & {onIntegration?:(observation:IntegrationObservation)=>void;onFailure?:(code:string)=>void;onAudioSupport?:(supported:boolean)=>void;onLeave:()=>void;client?:LaunchClient;socialControls?:ReactNode;audioControl?:PlayerAudioControl;embedded?:boolean;fixedViewport?:PlayerViewport}
export default function GameRuntime({gameId,gameVersionId,execution,audience,locale,onlineSessionReference,onLeave,client=defaultClient,socialControls,audioControl,embedded=false,fixedViewport,onAudioSupport,onFailure,onIntegration}:Props){
  const {audio,toggle}=usePlayerAudio(),audioRef=useRef(audio),support=useRef(onAudioSupport)
  const [audioSupported,setAudioSupported]=useState(false)
  useEffect(()=>{support.current=onAudioSupport},[onAudioSupport])
  const container=useRef<HTMLDivElement>(null),leave=useRef(onLeave)
  const failure=useRef(onFailure)
  const integration=useRef(onIntegration)
  useEffect(()=>{integration.current=onIntegration},[onIntegration])
  useEffect(()=>{failure.current=onFailure},[onFailure])
  const controller=useRef<ReturnType<typeof mountGameRuntime>|null>(null)
  const [state,setState]=useState<RuntimeState>({phase:'resolving'}),[attempt,setAttempt]=useState(0)
  useEffect(()=>{leave.current=onLeave},[onLeave])
  useEffect(()=>{
    const runtime=mountGameRuntime({onIntegration:value=>integration.current?.(value),container:container.current!,getAudioState:()=>audioRef.current,onAudioSupport:value=>{setAudioSupported(value);support.current?.(value)},request:{gameId,gameVersionId,execution,audience,locale,onlineSessionReference},client,onState:value=>{setState(value);if(value.phase==='failed')failure.current?.(value.error??'unknown')},onLeave:()=>leave.current()})
    controller.current=runtime
    return()=>{runtime.dispose();controller.current=null}
  },[gameId,gameVersionId,execution,audience,locale,onlineSessionReference,client,attempt])
  useEffect(()=>{audioRef.current=audio;controller.current?.updateAudio()},[audio])
  const busy=['resolving','launching','loading'].includes(state.phase)
  const content=<>
    <PlayerFrame viewport={fixedViewport}><div ref={container} className={styles.viewport} aria-busy={busy}/></PlayerFrame>
    {busy?<div className={styles.overlay}><p className={styles.message} role="status" aria-live="polite">Chargement du jeu…</p></div>:null}
    {state.phase==='failed'?<GamePlayerError message={state.error==='delivery_version_conflict'?'Une mise à jour de ce jeu attend la fin des sessions précédentes. Réessayez plus tard.':state.error==='delivery_cookie_unavailable'?'L’accès au jeu n’a pas pu être établi. Vérifiez les restrictions de stockage du navigateur ou réessayez.':state.error==='launch_expired'?'La session de jeu a expiré.':['hello_timeout','handshake_timeout','game_ready_timeout'].includes(state.error ?? '')?'Le jeu n’a pas terminé son initialisation.':'Le jeu ne peut pas continuer pour le moment.'} onRetry={()=>setAttempt(n=>n+1)} onBack={embedded?()=>controller.current?.close():undefined}/>:null}

  </>
  return embedded?<div className={styles.execution} data-phase={state.phase}>{content}</div>:<GamePlayerShell phase={state.phase} onLeave={()=>controller.current?.close()} socialControls={socialControls} audioControl={audioSupported?(audioControl??{muted:audio.muted,onToggle:toggle}):undefined}>{content}</GamePlayerShell>
}

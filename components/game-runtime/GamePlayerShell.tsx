'use client'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import styles from './GameRuntime.module.css'
import PlayerIcon from './PlayerIcon'

export type PlayerAudioControl={muted:boolean;onToggle:()=>void;disabled?:boolean}
type Props={presentation?:'legacy'|'sdk';children:ReactNode;onLeave:()=>void;socialControls?:ReactNode;audioControl?:PlayerAudioControl;phase?:string;canLeave?:boolean}
export default function GamePlayerShell({children,onLeave,socialControls,audioControl,phase,canLeave=true,presentation='sdk'}:Props){
  const shell=useRef<HTMLElement>(null)
  const [isFullscreen,setIsFullscreen]=useState(false),[fullscreenError,setFullscreenError]=useState(false)
  useEffect(()=>{
    const document=shell.current!.ownerDocument
    const sync=()=>setIsFullscreen(document.fullscreenElement===shell.current)
    document.addEventListener('fullscreenchange',sync)
    return()=>document.removeEventListener('fullscreenchange',sync)
  },[])
  async function fullscreen(){const element=shell.current;if(!element)return;try{if(element.ownerDocument.fullscreenElement===element)await element.ownerDocument.exitFullscreen();else await element.requestFullscreen();setFullscreenError(false)}catch{setFullscreenError(true)}}
  const fullscreenLabel=isFullscreen?'Quitter le plein écran':'Plein écran'
  const audioPending=['launcher','resolving','launching','loading'].includes(phase??'')
  const audioLabel=audioControl && !audioControl.disabled?(audioControl.muted?'Réactiver le son':'Couper le son'):audioPending?'Disponible pendant la partie':'Ce jeu ne prend pas en charge le contrôle audio'
  return <section ref={shell} className={styles.shell} aria-label="Jeu Chibasko Games" data-phase={phase} data-presentation={presentation}>
    <div className={styles.surface} data-player-surface>
      {children}
      {fullscreenError?<p className={styles.notice} role="status">Le plein écran n’est pas disponible. Tu peux continuer ici.</p>:null}
    </div>
    <div className={styles.dock} data-player-dock role="group" aria-label="Commandes du lecteur">
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
        <button className={styles.iconButton} type="button" aria-label={fullscreenLabel} title={fullscreenLabel} aria-pressed={isFullscreen} onClick={fullscreen} disabled={phase==='closed'}><PlayerIcon name={isFullscreen?'restore':'fullscreen'}/><span className={styles.tooltip} aria-hidden="true">{fullscreenLabel}</span></button>
        <button className={styles.iconButton} type="button" aria-label="Quitter le jeu" title="Quitter le jeu" disabled={!canLeave} onClick={onLeave}><PlayerIcon name="close"/><span className={styles.tooltip} aria-hidden="true">Quitter le jeu</span></button>
      </div>
    </div>

  </section>
}

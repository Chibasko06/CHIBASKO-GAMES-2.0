'use client'
import {useEffect,useRef,useState,type ReactNode} from 'react'
import styles from './GameRuntime.module.css'
import PlayerIcon from './PlayerIcon'
import {createPlayerExpansion,type PlayerExpansionMode} from '@/lib/game-runtime/playerExpansion'

export type PlayerAudioControl={muted:boolean;onToggle:()=>void;disabled?:boolean}
type Props={presentation?:'legacy'|'sdk';children:ReactNode;onLeave:()=>void;socialControls?:ReactNode;audioControl?:PlayerAudioControl;phase?:string;canLeave?:boolean}
export default function GamePlayerShell({children,onLeave,socialControls,audioControl,phase,canLeave=true,presentation='sdk'}:Props){
  const shell=useRef<HTMLElement>(null)
  const expansion=useRef<ReturnType<typeof createPlayerExpansion>|null>(null)
  const [mode,setMode]=useState<PlayerExpansionMode>('inline'),[fullscreenError,setFullscreenError]=useState(false)
  useEffect(()=>{
    const control=createPlayerExpansion(shell.current!,setMode,()=>setFullscreenError(true));expansion.current=control
    return()=>{control.dispose();expansion.current=null}
  },[])
  function fullscreen(){setFullscreenError(false);void expansion.current?.toggle()}
  async function leave(){await expansion.current?.exit();onLeave()}
  const fullscreenLabel=mode==='native'?'Quitter le plein écran':mode==='immersive'?'Réduire le jeu':'Agrandir le jeu'
  const audioPending=['launcher','resolving','launching','loading'].includes(phase??'')
  const audioLabel=audioControl && !audioControl.disabled?(audioControl.muted?'Réactiver le son':'Couper le son'):audioPending?'Disponible pendant la partie':'Ce jeu ne prend pas en charge le contrôle audio'
  return <section ref={shell} className={styles.shell} aria-label="Jeu Chibasko Games" data-phase={phase} data-presentation={presentation} data-expansion={mode}>
    <div className={styles.surface} data-player-surface>
      {children}
      {fullscreenError?<p className={styles.notice} role="status">Le navigateur n’a pas confirmé le changement d’affichage. Utilisez son geste de sortie si nécessaire.</p>:null}
      {mode==='immersive'&&<p className={styles.expansionStatus} role="status">Mode immersif web. Les barres du navigateur peuvent rester visibles.</p>}
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
        <button data-player-expand className={styles.iconButton} type="button" aria-label={fullscreenLabel} title={fullscreenLabel} aria-pressed={mode!=='inline'} onClick={fullscreen} disabled={phase==='closed'&&mode==='inline'}><PlayerIcon name={mode==='inline'?'fullscreen':'restore'}/><span className={styles.tooltip} aria-hidden="true">{fullscreenLabel}</span></button>
        <button className={styles.iconButton} type="button" aria-label="Quitter le jeu" title="Quitter le jeu" disabled={!canLeave} onClick={()=>void leave()}><PlayerIcon name="close"/><span className={styles.tooltip} aria-hidden="true">Quitter le jeu</span></button>
      </div>
    </div>

  </section>
}

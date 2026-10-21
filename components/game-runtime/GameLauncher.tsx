'use client'
import {useState} from 'react'
import styles from './GameRuntime.module.css'

export type LauncherAction={id:string;label:string;description?:string;available:boolean}
type Props={developerName?:string|null;title:string;coverUrl?:string|null;actions:readonly LauncherAction[];onPlay:(id:string)=>void}
export default function GameLauncher({title,developerName,coverUrl,actions,onPlay}:Props){
  const [failedCover,setFailedCover]=useState<string|null>(null)
  return <div className={styles.launcher} aria-label="Écran de lancement">
    <div className={styles.launcherContent}>
      <div className={styles.cover}>
        {coverUrl && failedCover!==coverUrl?
          // Catalogue covers can come from external providers as well as platform storage.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" referrerPolicy="no-referrer" onError={()=>setFailedCover(coverUrl)}/>
          :<span aria-hidden="true">{title.charAt(0).toLocaleUpperCase()}</span>}
      </div>
      <div className={styles.launcherInfo}>
        <p className={styles.eyebrow}>Chibasko Games</p>
        <h2 title={title}>{title}</h2>
        {developerName?.trim()?<p className={styles.developer} title={developerName.trim()}>Par {developerName.trim()}</p>:null}
        <div className={styles.modes}>
          {actions.map(action=><button key={action.id} type="button" className={styles.modeButton} disabled={!action.available} title={action.description?`${action.label} — ${action.description}`:action.label} onClick={()=>onPlay(action.id)}><strong>{action.label}</strong>{action.description && <span>{action.description}</span>}</button>)}
        </div>
        {!actions.some(action=>action.available) && <p role="status" className={styles.unavailable}>Jeu temporairement indisponible</p>}
      </div>
    </div>
  </div>
}

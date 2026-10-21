'use client'
import {useState} from 'react'
import GamePlayerShell from './game-runtime/GamePlayerShell'
import GameSocialControls from './game-runtime/GameSocialControls'
import styles from './game-runtime/GameRuntime.module.css'
type Props={gameId:string;gameUrl:string;initialLikes:number;initialDislikes:number}
export default function GameViewport({gameId,gameUrl,initialLikes,initialDislikes}:Props){
  const [closed,setClosed]=useState(false),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0)
  const retry=()=>{setClosed(false);setFailed(false);setAttempt(value=>value+1)}
  return <GamePlayerShell onLeave={()=>setClosed(true)} socialControls={<GameSocialControls gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes}/>}>
    {!closed && !failed?<iframe key={attempt} title="Jeu HTML5" src={gameUrl} className={styles.legacyFrame} allowFullScreen allow="fullscreen; autoplay; clipboard-write; gamepad" onError={()=>setFailed(true)}/>:null}
    {closed || failed?<div className={styles.overlay}><div className={styles.message} role={failed?'alert':'status'}><p>{failed?'Le jeu ne peut pas être chargé pour le moment.':'Jeu fermé'}</p><button className={styles.retry} type="button" onClick={retry}>{failed?'Réessayer':'Rejouer'}</button></div></div>:null}
  </GamePlayerShell>
}

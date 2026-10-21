'use client'
import {useState} from 'react'
import GamePlayerShell from './game-runtime/GamePlayerShell'
import GameSocialControls from './game-runtime/GameSocialControls'
import GameLauncher from './game-runtime/GameLauncher'
import GamePlayerError from './game-runtime/GamePlayerError'
import styles from './game-runtime/GameRuntime.module.css'

type Props={gameId:string;gameUrl:string;title?:string;coverUrl?:string|null;initialLikes:number;initialDislikes:number}
export default function GameViewport({gameId,gameUrl,title='Jeu',coverUrl,initialLikes,initialDislikes}:Props){
  const [phase,setPhase]=useState<'launcher'|'launching'|'playing'|'error'>('launcher'),[attempt,setAttempt]=useState(0)
  const launch=()=>{setAttempt(value=>value+1);setPhase('launching')}
  const back=()=>setPhase('launcher')
  return <GamePlayerShell phase={phase} canLeave={phase!=='launcher'} onLeave={back} socialControls={<GameSocialControls gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes}/>}>
    {phase==='launcher'?<GameLauncher title={title} coverUrl={coverUrl} actions={[{id:'play',label:'Jouer',available:true}]} onPlay={launch}/>:null}
    {phase==='launching' || phase==='playing'?<iframe key={attempt} title="Jeu HTML5" src={gameUrl} className={styles.legacyFrame} allowFullScreen allow="fullscreen; autoplay; clipboard-write; gamepad" onLoad={()=>setPhase('playing')} onError={()=>setPhase('error')}/>:null}
    {phase==='launching'?<div className={styles.overlay}><p className={styles.message} role="status">Chargement du jeu…</p></div>:null}
    {phase==='error'?<GamePlayerError message="Le jeu ne peut pas être chargé pour le moment." onRetry={launch} onBack={back}/>:null}
  </GamePlayerShell>
}

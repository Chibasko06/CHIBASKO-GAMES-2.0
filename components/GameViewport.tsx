'use client'
import PlayerFrame,{legacyViewport,type PlayerViewport} from './game-runtime/PlayerFrame'
import {useState} from 'react'
import GamePlayerShell from './game-runtime/GamePlayerShell'
import GameSocialControls from './game-runtime/GameSocialControls'
import GameLauncher from './game-runtime/GameLauncher'
import GamePlayerError from './game-runtime/GamePlayerError'
import styles from './game-runtime/GameRuntime.module.css'
import {legacyFramePolicy} from '@/lib/game-runtime/iframePolicy'

type Props={developerName?:string|null;nativeViewport?:PlayerViewport;gameId:string;gameUrl:string;title?:string;coverUrl?:string|null;initialLikes:number;initialDislikes:number}
export default function GameViewport({gameId,gameUrl,title='Jeu',developerName,coverUrl,nativeViewport=legacyViewport,initialLikes,initialDislikes}:Props){
  const [phase,setPhase]=useState<'launcher'|'launching'|'playing'|'error'>('launcher'),[attempt,setAttempt]=useState(0)
  const [frame,setFrame]=useState<ReturnType<typeof legacyFramePolicy>|null>(null)
  const launch=()=>{try{setFrame(legacyFramePolicy(gameUrl,window.location.origin));setAttempt(value=>value+1);setPhase('launching')}catch{setFrame(null);setPhase('error')}}
  const back=()=>setPhase('launcher')
  return <GamePlayerShell presentation="legacy" phase={phase} canLeave={phase!=='launcher'} onLeave={back} socialControls={<GameSocialControls gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes}/>}>
    {phase==='launcher'?<GameLauncher developerName={developerName} title={title} coverUrl={coverUrl} actions={[{id:'play',label:'Jouer',available:true}]} onPlay={launch}/>:null}
    {(phase==='launching' || phase==='playing')&&frame?<PlayerFrame viewport={nativeViewport}><iframe key={attempt} title="Jeu HTML5" {...frame} className={styles.legacyFrame} onLoad={()=>setPhase('playing')} onError={()=>setPhase('error')}/></PlayerFrame>:null}
    {phase==='launching'?<div className={styles.overlay}><p className={styles.message} role="status">Chargement du jeu…</p></div>:null}
    {phase==='error'?<GamePlayerError message="Le jeu ne peut pas être chargé pour le moment." onRetry={launch} onBack={back}/>:null}
  </GamePlayerShell>
}

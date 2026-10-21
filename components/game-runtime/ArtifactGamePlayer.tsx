'use client'
import {useRef,useState} from 'react'
import type {GameCapabilities} from '@chibaskogames/sdk'
import GamePlayerShell from './GamePlayerShell'
import GameSocialControls from './GameSocialControls'
import GameRuntime from './GameRuntime'
import DurableLobby,{type LobbyPlayerHandle} from '../multiplayer/DurableLobby'
import {initialPlayerMode,playerModes,type PlayerMode} from '@/lib/game-runtime/modes'
import styles from './GameRuntime.module.css'

type Props={gameId:string;versionId:string|null;slug:string;capabilities?:GameCapabilities;availableAccess:readonly ('public'|'private')[];initialLikes:number;initialDislikes:number}
export default function ArtifactGamePlayer({gameId,versionId,slug,capabilities,availableAccess,initialLikes,initialDislikes}:Props){
  const modes=versionId?playerModes(capabilities,availableAccess):[]
  const [selected,setSelected]=useState<PlayerMode|null>(()=>versionId?initialPlayerMode(capabilities,availableAccess):null)
  const lobby=useRef<LobbyPlayerHandle>(null)
  const reset=()=>setSelected(null)
  const active=modes.find(mode=>mode.id===selected && mode.available)?.id
  return <GamePlayerShell onLeave={()=>{if(active && active!=='local' && lobby.current)lobby.current.leave();else reset()}} socialControls={<GameSocialControls gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes}/>}>
    {active==='local' && versionId?<GameRuntime embedded gameId={gameId} gameVersionId={versionId} execution="local" audience="published" locale="fr" onLeave={reset}/>
    :active && active!=='local'?<div className={styles.lobbySurface}><DurableLobby key={active} embedded exitRef={lobby} gameId={gameId} slug={slug} access={active} onLeave={reset}/></div>
    :<div className={styles.selector}><div className={styles.modeContent}>
      <p className={styles.eyebrow}>Chibasko Games</p>
      <h2>{modes.some(mode=>mode.available)?'Choisis ton mode':'Jeu temporairement indisponible'}</h2>
      <div className={styles.modes}>{modes.map(mode=><button key={mode.id} type="button" className={styles.modeButton} disabled={!mode.available} onClick={()=>setSelected(mode.id)}><strong>{mode.label}</strong><span>{mode.description}</span></button>)}</div>
    </div></div>}
  </GamePlayerShell>
}

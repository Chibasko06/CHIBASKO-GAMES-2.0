'use client'
import {useRef,useState} from 'react'
import type {GameCapabilities} from '@chibaskogames/sdk'
import GamePlayerShell from './GamePlayerShell'
import GameSocialControls from './GameSocialControls'
import GameRuntime from './GameRuntime'
import DurableLobby,{type LobbyPlayerHandle} from '../multiplayer/DurableLobby'
import {playerModes,type PlayerMode} from '@/lib/game-runtime/modes'
import GameLauncher from './GameLauncher'
import styles from './GameRuntime.module.css'

type Props={gameId:string;versionId:string|null;slug:string;title?:string;coverUrl?:string|null;capabilities?:GameCapabilities;availableAccess:readonly ('public'|'private')[];initialLikes:number;initialDislikes:number}
export default function ArtifactGamePlayer({gameId,versionId,slug,title='Jeu',coverUrl,capabilities,availableAccess,initialLikes,initialDislikes}:Props){
  const modes=versionId?playerModes(capabilities,availableAccess):[]
  const [selected,setSelected]=useState<PlayerMode|null>(null)
  const lobby=useRef<LobbyPlayerHandle>(null)
  const reset=()=>setSelected(null)
  const active=modes.find(mode=>mode.id===selected && mode.available)?.id
  return <GamePlayerShell phase={!active?'launcher':undefined} canLeave={!!active} onLeave={()=>{if(active && active!=='local' && lobby.current)lobby.current.leave();else reset()}} socialControls={<GameSocialControls gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes}/>}>
    {active==='local' && versionId?<GameRuntime embedded gameId={gameId} gameVersionId={versionId} execution="local" audience="published" locale="fr" onLeave={reset}/>
    :active && active!=='local'?<div className={styles.lobbySurface}><DurableLobby key={active} embedded exitRef={lobby} gameId={gameId} slug={slug} access={active} onLeave={reset}/></div>
    :<GameLauncher title={title} coverUrl={coverUrl} actions={modes} onPlay={id=>{const mode=modes.find(mode=>mode.id===id && mode.available);if(mode)setSelected(mode.id)}}/>}
  </GamePlayerShell>
}

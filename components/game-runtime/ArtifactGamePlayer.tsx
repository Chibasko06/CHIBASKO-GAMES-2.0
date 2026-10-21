'use client'
import {usePlayerAudio} from './usePlayerAudio'
import {useRef,useState} from 'react'
import type {GameCapabilities} from '@chibaskogames/sdk'
import PlayerFrame,{type PlayerViewport} from './PlayerFrame'
import GamePlayerShell from './GamePlayerShell'
import GameSocialControls from './GameSocialControls'
import GameRuntime from './GameRuntime'
import DurableLobby,{type LobbyPlayerHandle} from '../multiplayer/DurableLobby'
import {playerModes,type PlayerMode} from '@/lib/game-runtime/modes'
import GameLauncher from './GameLauncher'
import styles from './GameRuntime.module.css'

type Props={developerName?:string|null;fixedViewport?:PlayerViewport;gameId:string;versionId:string|null;slug:string;title?:string;coverUrl?:string|null;capabilities?:GameCapabilities;availableAccess:readonly ('public'|'private')[];initialLikes:number;initialDislikes:number}
export default function ArtifactGamePlayer({gameId,versionId,slug,title='Jeu',developerName,coverUrl,fixedViewport,capabilities,availableAccess,initialLikes,initialDislikes}:Props){
  const {audio,toggle}=usePlayerAudio()
  const [audioSupported,setAudioSupported]=useState(false)
  const modes=versionId?playerModes(capabilities,availableAccess):[]
  const [selected,setSelected]=useState<PlayerMode|null>(null)
  const lobby=useRef<LobbyPlayerHandle>(null)
  const reset=()=>{setAudioSupported(false);setSelected(null)}
  const active=modes.find(mode=>mode.id===selected && mode.available)?.id
  return <GamePlayerShell audioControl={audioSupported?{muted:audio.muted,onToggle:toggle}:undefined} phase={!active?'launcher':undefined} canLeave={!!active} onLeave={()=>{if(active && active!=='local' && lobby.current)lobby.current.leave();else reset()}} socialControls={<GameSocialControls gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes}/>}>
    {active==='local' && versionId?<GameRuntime onAudioSupport={setAudioSupported} fixedViewport={fixedViewport} embedded gameId={gameId} gameVersionId={versionId} execution="local" audience="published" locale="fr" onLeave={reset}/>
    :active && active!=='local'?<PlayerFrame viewport={fixedViewport}><div className={styles.lobbySurface}><DurableLobby onAudioSupport={setAudioSupported} key={active} embedded exitRef={lobby} gameId={gameId} slug={slug} access={active} onLeave={reset}/></div></PlayerFrame>
    :<GameLauncher developerName={developerName} title={title} coverUrl={coverUrl} actions={modes} onPlay={id=>{const mode=modes.find(mode=>mode.id===id && mode.available);if(mode)setSelected(mode.id)}}/>}
  </GamePlayerShell>
}

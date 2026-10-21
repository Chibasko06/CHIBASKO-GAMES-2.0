'use client'
import { useRouter } from 'next/navigation'
import GameRuntime from './GameRuntime'
import GameSocialControls from './GameSocialControls'
export default function ArtifactLocalGame({gameId,versionId,slug,initialLikes=0,initialDislikes=0}:{gameId:string;versionId:string;slug:string;initialLikes?:number;initialDislikes?:number}){
 const router=useRouter()
 return <GameRuntime gameId={gameId} gameVersionId={versionId} execution="local" audience="published" locale="fr" onLeave={()=>router.push('/games/'+slug)} socialControls={<GameSocialControls gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes}/>} />
}

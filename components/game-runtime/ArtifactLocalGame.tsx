'use client'
import { useRouter } from 'next/navigation'
import GameRuntime from './GameRuntime'
import GameReactions from '../GameReactions'
import FavoriteButton from '../FavoriteButton'
export default function ArtifactLocalGame({gameId,versionId,slug,initialLikes=0,initialDislikes=0}:{gameId:string;versionId:string;slug:string;initialLikes?:number;initialDislikes?:number}){
 const router=useRouter()
 return <GameRuntime gameId={gameId} gameVersionId={versionId} execution="local" audience="published" locale="fr" onLeave={()=>router.push('/games/'+slug)} socialControls={<><GameReactions gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes} compact/><FavoriteButton gameId={gameId} compact/></>} />
}

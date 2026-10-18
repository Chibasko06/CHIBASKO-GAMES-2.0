'use client'
import { useRouter } from 'next/navigation'
import GameRuntime from './GameRuntime'
export default function ArtifactLocalGame({gameId,versionId,slug}:{gameId:string;versionId:string;slug:string}){
 const router=useRouter()
 return <GameRuntime gameId={gameId} gameVersionId={versionId} execution="local" audience="published" locale="fr" onLeave={()=>router.push('/games/'+slug)} />
}

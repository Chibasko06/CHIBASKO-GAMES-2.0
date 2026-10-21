'use client'
import type {GameCapabilities} from '@chibaskogames/sdk'
import ArtifactGamePlayer from './ArtifactGamePlayer'
export default function ArtifactLocalGame({gameId,versionId,slug,title,developerName,coverUrl,local,initialLikes=0,initialDislikes=0}:{gameId:string;versionId:string;slug:string;title:string;developerName?:string|null;coverUrl?:string|null;local:NonNullable<GameCapabilities['local']>;initialLikes?:number;initialDislikes?:number}){
 return <ArtifactGamePlayer gameId={gameId} versionId={versionId} slug={slug} title={title} developerName={developerName} coverUrl={coverUrl} capabilities={{local}} availableAccess={[]} initialLikes={initialLikes} initialDislikes={initialDislikes}/>
}

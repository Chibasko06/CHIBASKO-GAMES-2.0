'use client'
import type {GameCapabilities} from '@chibaskogames/sdk'
import ArtifactGamePlayer from './ArtifactGamePlayer'
export default function ArtifactLocalGame({gameId,versionId,slug,title,coverUrl,local,initialLikes=0,initialDislikes=0}:{gameId:string;versionId:string;slug:string;title:string;coverUrl?:string|null;local:NonNullable<GameCapabilities['local']>;initialLikes?:number;initialDislikes?:number}){
 return <ArtifactGamePlayer gameId={gameId} versionId={versionId} slug={slug} title={title} coverUrl={coverUrl} capabilities={{local}} availableAccess={[]} initialLikes={initialLikes} initialDislikes={initialDislikes}/>
}

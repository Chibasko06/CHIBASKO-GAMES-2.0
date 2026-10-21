'use client'
import GameReactions from '../GameReactions'
import FavoriteButton from '../FavoriteButton'
export default function GameSocialControls({gameId,initialLikes,initialDislikes}:{gameId:string;initialLikes:number;initialDislikes:number}){
  return <><GameReactions gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes} compact/><FavoriteButton gameId={gameId} compact/></>
}

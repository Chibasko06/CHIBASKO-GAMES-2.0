import {createRoot} from 'react-dom/client'
import type {ComponentProps} from 'react'
import ArtifactGamePlayer from '../../components/game-runtime/ArtifactGamePlayer'
import GamePagePlayerLayout from '../../components/GamePagePlayerLayout'
import GameViewport from '../../components/GameViewport'
type Options=ComponentProps<typeof ArtifactGamePlayer> & {kind:'artifact'|'legacy';gameUrl?:string;withRecommendations?:boolean;nativeViewport?:{width:number;height:number}}
declare global{interface Window{gamePlayerFixture:{render(options:Options):void}}}
const root=createRoot(document.getElementById('player')!)
const recommendations=Array.from({length:5},(_,i)=>({id:'recommendation-'+i,slug:'recommendation-'+i,title:'Jeu similaire '+(i+1),thumbnail_url:'https://portal.test/cover.svg',is_published:true,categories:[{id:'action',slug:'action',name:'Action'}]}))
window.gamePlayerFixture={render(options){
 const player=options.kind==='legacy'?<GameViewport nativeViewport={options.nativeViewport} gameId={options.gameId} title={options.title} developerName={options.developerName} coverUrl={options.coverUrl} gameUrl={options.gameUrl!} initialLikes={0} initialDislikes={0}/>:<ArtifactGamePlayer {...options}/>
 root.render(options.withRecommendations?<GamePagePlayerLayout recommendations={recommendations} primaryCategoryId="action">{player}</GamePagePlayerLayout>:player)
}}

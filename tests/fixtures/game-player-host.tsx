import {createRoot} from 'react-dom/client'
import type {ComponentProps} from 'react'
import ArtifactGamePlayer from '../../components/game-runtime/ArtifactGamePlayer'
import GameViewport from '../../components/GameViewport'
type Options=ComponentProps<typeof ArtifactGamePlayer> & {kind:'artifact'|'legacy';gameUrl?:string;nativeViewport?:{width:number;height:number}}
declare global{interface Window{gamePlayerFixture:{render(options:Options):void}}}
const root=createRoot(document.getElementById('player')!)
window.gamePlayerFixture={render(options){root.render(options.kind==='legacy'?<GameViewport nativeViewport={options.nativeViewport} gameId={options.gameId} title={options.title} coverUrl={options.coverUrl} gameUrl={options.gameUrl!} initialLikes={0} initialDislikes={0}/>:<ArtifactGamePlayer {...options}/>)}}

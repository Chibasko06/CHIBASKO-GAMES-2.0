import {createRoot} from 'react-dom/client'
import {useState} from 'react'
import AuthInvitationHost from '../../components/AuthInvitationHost'
import GamePlayerShell from '../../components/game-runtime/GamePlayerShell'
import PlayerFrame,{legacyViewport} from '../../components/game-runtime/PlayerFrame'
import {externalFramePolicy,legacyFramePolicy,GAME_SANDBOX,gameFramePermissions} from '../../lib/game-runtime/iframePolicy'
import GameSocialControls from '../../components/game-runtime/GameSocialControls'
import GameReactions from '../../components/GameReactions'
import FavoriteButton from '../../components/FavoriteButton'
import GameReviews from '../../components/GameReviews'
import ProfileSocialActions from '../../components/ProfileSocialActions'
import GameSharingMenu from '../../components/GameSharingMenu'
import AuthRequired from '../../components/AuthRequired'
import {requestAuthentication} from '../../lib/authInvitation'

function App(){
 const query=new URLSearchParams(location.search),kind=query.get('kind')??'legacy',page=query.has('page'),src='https://play.example.com/index.html'
 const [mounted,setMounted]=useState(true)
 const policy=kind==='external'?externalFramePolicy(src):kind==='legacy'?legacyFramePolicy(src,location.origin):{src,sandbox:GAME_SANDBOX,allow:gameFramePermissions(new URL(src).origin),referrerPolicy:'no-referrer' as const}
 return <><AuthInvitationHost/><header>Navigation du portail</header><button id="remove" onClick={()=>setMounted(false)}>Retirer le lecteur</button><button id="repeat" onClick={event=>{requestAuthentication('Première invitation',event.currentTarget);requestAuthentication('Deuxième invitation',event.currentTarget)}}>Invitations répétées</button><button id="long" onClick={event=>requestAuthentication('Une explication longue. '.repeat(100),event.currentTarget)}>Texte long</button><div style={{height:300}}/>
 {page?<><GameReactions gameId="fixture" initialLikes={0} initialDislikes={0}/><FavoriteButton gameId="fixture"/><GameReviews gameId="fixture"/><ProfileSocialActions target="other" username="joueur"/><GameSharingMenu gameId="fixture" title="Jeu" url="https://portal.test/games/fixture"/><AuthRequired/></>:mounted&&<GamePlayerShell socialControls={<GameSocialControls gameId="fixture" initialLikes={0} initialDislikes={0}/>} onLeave={()=>{}}><PlayerFrame viewport={kind==='legacy'||kind==='external'?legacyViewport:undefined}><iframe title="Jeu isolé" {...policy} style={{position:'absolute',inset:0,width:'100%',height:'100%',border:0}}/></PlayerFrame></GamePlayerShell>}
 <div style={{height:1200}}>Bas de page</div></>
}
createRoot(document.getElementById('root')!).render(<App/> )

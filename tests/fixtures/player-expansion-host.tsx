import {createRoot} from 'react-dom/client'
import {useState} from 'react'
import GamePlayerShell from '../../components/game-runtime/GamePlayerShell'
import PlayerFrame,{legacyViewport,type PlayerSizing} from '../../components/game-runtime/PlayerFrame'
import {externalFramePolicy,legacyFramePolicy,gameFramePermissions,GAME_SANDBOX} from '../../lib/game-runtime/iframePolicy'

function Fixture(){
 const [mounted,setMounted]=useState(true),[muted,setMuted]=useState(false),[left,setLeft]=useState(false)
 const query=new URLSearchParams(location.search),kind=query.get('kind')??'sdk',src='https://play.example.com/index.html'
 const sizing:PlayerSizing|undefined=query.get('sizing')==='responsive'?{mode:'responsive'}:query.get('sizing')==='fixed'?{mode:'fixed',viewport:legacyViewport}:undefined
 const viewport=kind==='legacy'||kind==='external'?legacyViewport:undefined
 const frame=kind==='external'?externalFramePolicy(src):kind==='legacy'?legacyFramePolicy(src,location.origin):{src,sandbox:GAME_SANDBOX,allow:gameFramePermissions(new URL(src).origin),referrerPolicy:'no-referrer' as const}
 return <><button id="remove-player" onClick={()=>setMounted(false)}>Retirer le lecteur</button>{mounted&&<GamePlayerShell presentation={kind==='legacy'||kind==='external'?'legacy':'sdk'} audioControl={{muted,onToggle:()=>setMuted(v=>!v)}} onLeave={()=>setLeft(true)} socialControls={<><button aria-label="J’aime" onClick={event=>{event.currentTarget.dataset.count=String(Number(event.currentTarget.dataset.count??0)+1)}}>J’aime</button><button disabled>Je n’aime pas</button><button disabled>Favori</button></>}><PlayerFrame viewport={viewport} sizing={sizing}><iframe title="Jeu de test isolé" {...frame} style={{position:'absolute',inset:0,width:'100%',height:'100%',border:0}}/></PlayerFrame><span id="audio-value">{muted?'muted':'audible'}</span></GamePlayerShell>}<p id="left-game">{left?'left':'playing'}</p></>
}
const root=createRoot(document.getElementById('player')!);root.render(<Fixture/>);
Object.assign(window,{unmountPlayer:()=>root.unmount()})

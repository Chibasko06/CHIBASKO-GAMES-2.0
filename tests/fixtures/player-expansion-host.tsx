import {createRoot} from 'react-dom/client'
import {useState} from 'react'
import GamePlayerShell from '../../components/game-runtime/GamePlayerShell'
import {externalFramePolicy,legacyFramePolicy,gameFramePermissions,GAME_SANDBOX} from '../../lib/game-runtime/iframePolicy'

function Fixture(){
 const [mounted,setMounted]=useState(true),[muted,setMuted]=useState(false),[left,setLeft]=useState(false)
 const kind=new URLSearchParams(location.search).get('kind')??'sdk',src='https://play.example.com/index.html'
 const frame=kind==='external'?externalFramePolicy(src):kind==='legacy'?legacyFramePolicy(src,location.origin):{src,sandbox:GAME_SANDBOX,allow:gameFramePermissions(new URL(src).origin),referrerPolicy:'no-referrer' as const}
 return <><button id="remove-player" onClick={()=>setMounted(false)}>Retirer le lecteur</button>{mounted&&<GamePlayerShell presentation={kind==='legacy'||kind==='external'?'legacy':'sdk'} audioControl={{muted,onToggle:()=>setMuted(v=>!v)}} onLeave={()=>setLeft(true)}><iframe title="Jeu de test isolé" {...frame} style={{position:'absolute',inset:0,width:'100%',height:'100%',border:0}}/><span id="audio-value">{muted?'muted':'audible'}</span></GamePlayerShell>}<p id="left-game">{left?'left':'playing'}</p></>
}
const root=createRoot(document.getElementById('player')!);root.render(<Fixture/>);
Object.assign(window,{unmountPlayer:()=>root.unmount()})

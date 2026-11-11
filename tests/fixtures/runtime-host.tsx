import {createRoot} from 'react-dom/client'
import GameRuntime from '../../components/game-runtime/GameRuntime'
import {httpLaunchClient} from '../../lib/game-runtime/client'
import type {LaunchRequest} from '../../lib/game-runtime/contracts'
declare global {interface Window {runtimeFixture:{observations:{mode:string;protocol:number|null}[];open(request:LaunchRequest):void;unmount():void}}}
const roots:ReturnType<typeof createRoot>[]=[]
window.runtimeFixture={
  observations:[],
  open(request) {
    const node=document.createElement('div');node.className='runtime-root';document.body.append(node)
    const root=createRoot(node);roots.push(root)
    root.render(<GameRuntime {...request} onIntegration={value=>window.runtimeFixture.observations.push({mode:value.mode,protocol:value.protocol})} client={httpLaunchClient(async()=>request.audience==='preview'||request.execution==='online'?'fixture-bearer':null)} onLeave={()=>root.render(<p>Jeu quitté</p>)}/> )
  },
  unmount(){for(const root of roots)root.unmount();roots.length=0;document.querySelectorAll('.runtime-root').forEach(n=>n.remove())},
}

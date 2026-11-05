'use client'
import {useState} from 'react'
import {compatibilityLabels,gameCompatibility,supportsDevice,type DiscoveryDevice} from '@/lib/gameCompatibility'
export default function GameCompatibilityNotice({value,device,children}:{value:string|null;device:DiscoveryDevice;children:React.ReactNode}){
 const [override,setOverride]=useState(false),kind=gameCompatibility(value),supported=supportsDevice(value,device)
 return <div className="space-y-4"><p className="text-sm text-zinc-300">{compatibilityLabels[kind]}</p>
  {(!supported||kind==='unknown')&&<div className="space-y-3 rounded-xl border border-amber-800 bg-amber-950/20 p-4 text-sm text-amber-100"><p>{kind==='unknown'?'La compatibilité de ce jeu n’a pas encore été vérifiée.':device==='mobile'?'Ce jeu est déclaré pour ordinateur. Ses commandes peuvent être inutilisables sur cet appareil.':'Ce jeu est déclaré pour mobile. Son utilisation sur ordinateur peut être limitée.'}</p><p>La détection de l’appareil est indicative. Sur un appareil hybride, tu peux choisir de continuer.</p>{!override&&<button type="button" className="min-h-11 rounded-lg border border-amber-600 px-4 py-2 focus-visible:outline-2 focus-visible:outline-cyan-300" onClick={()=>setOverride(true)}>Continuer vers le lecteur</button>}</div>}
  {(supported&&kind!=='unknown'||override)&&children}
 </div>
}

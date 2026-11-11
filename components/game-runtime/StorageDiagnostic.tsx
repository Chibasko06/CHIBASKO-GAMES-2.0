'use client'
import {useEffect,useRef,useState} from 'react'
import {GAME_SANDBOX,gameFramePermissions} from '@/lib/game-runtime/iframePolicy'

type Result={cookie:boolean;retained:boolean;local:boolean;indexed:boolean}
type Run={nonce:string;phase:'write'|'read';previousHash?:string}
const labels:Record<keyof Result,string>={cookie:'Cookie sécurisé transmis',retained:'Cookie conservé entre deux chargements',local:'localStorage conservé après rechargement',indexed:'IndexedDB conservé après rechargement'}

export default function StorageDiagnostic({origin}:{origin:string}){
 const frame=useRef<HTMLIFrameElement>(null),first=useRef<{hash:string;result:Result}|null>(null)
 const [run,setRun]=useState<Run|null>(null),[result,setResult]=useState<Result|null>(null),[error,setError]=useState('')
 useEffect(()=>{
  if(!run)return
  const timeout=setTimeout(()=>{setRun(null);setError('L’hôte de diagnostic n’a pas répondu. Vérifiez son déploiement, le réseau et les restrictions du navigateur.')},12000)
  const receive=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow||event.origin!==origin)return
   const data=event.data
   if(!data||typeof data!=='object'||Object.keys(data).length!==5||data.channel!=='chibasko.storage-check'||data.nonce!==run.nonce||data.phase!==run.phase||typeof data.hash!=='string'||!/^[a-f0-9]{64}$/.test(data.hash))return
   const value=data.result
   if(!value||typeof value!=='object'||Object.keys(value).length!==4||!Object.keys(labels).every(key=>typeof value[key]==='boolean'))return
   clearTimeout(timeout)
   if(run.phase==='write'){first.current={hash:data.hash,result:value};setRun({...run,phase:'read',previousHash:data.hash})}
   else{const previous=first.current!.result;setResult({cookie:previous.cookie&&value.cookie,retained:value.retained,local:previous.local&&value.local,indexed:previous.indexed&&value.indexed});setRun(null)}
  }
  window.addEventListener('message',receive)
  return()=>{clearTimeout(timeout);window.removeEventListener('message',receive)}
 },[run,origin])
 const start=()=>{first.current=null;setResult(null);setError('');setRun({nonce:crypto.randomUUID(),phase:'write'})}
 const src=run?origin+'/#'+new URLSearchParams({parent:typeof window==='undefined'?'':window.location.origin,nonce:run.nonce,phase:run.phase,...(run.previousHash?{previousHash:run.previousHash}:{})}):undefined
 return <section aria-labelledby="storage-diagnostic-title" className="space-y-5">
  <h1 id="storage-diagnostic-title" className="text-2xl font-bold text-white">Diagnostic du stockage des jeux</h1>
  <p className="text-sm leading-6 text-zinc-300">Ce test vérifie les cookies, localStorage et IndexedDB dans le contexte du lecteur Chibasko Games. Il ne lit aucune sauvegarde de jeu et n’envoie aucun résultat à Supabase.</p>
  <button type="button" disabled={Boolean(run)} onClick={start} className="rounded-xl border border-cyan-500 bg-cyan-500/10 px-5 py-3 text-sm font-semibold text-cyan-200 outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50">{run?'Vérification en cours…':'Lancer le diagnostic'}</button>
  {run?<><p role="status" className="text-sm text-zinc-300">{run.phase==='write'?'Écriture de données de test sur un hôte isolé…':'Vérification après rechargement…'}</p><iframe key={run.nonce+run.phase} ref={frame} title="Vérification du stockage des jeux" src={src} sandbox={GAME_SANDBOX} allow={gameFramePermissions(origin)} referrerPolicy="no-referrer" className="h-24 w-full rounded-xl border border-zinc-700 bg-white"/></>:null}
  {error?<p role="alert" className="text-sm text-amber-200">{error}</p>:null}
  {result?<div role="status" aria-live="polite"><dl className="divide-y divide-zinc-800 rounded-xl border border-zinc-800 px-4">{Object.entries(labels).map(([key,label])=><div key={key} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><dt className="text-zinc-300">{label}</dt><dd className={result[key as keyof Result]?'text-cyan-200':'text-amber-200'}>{result[key as keyof Result]?'Disponible':'Indisponible'}</dd></div>)}</dl><p className="mt-4 text-sm text-zinc-400">Ces résultats décrivent ce navigateur et ses réglages actuels. Ils ne garantissent pas une conservation après suppression des données locales ou en navigation privée.</p></div>:null}
 </section>
}

'use client'
import AuthRequired from '@/components/AuthRequired'
import Link from 'next/link'
import {useEffect,useState,useRef} from 'react'
import {useRouter} from 'next/navigation'
import {useAuth} from '@/components/AuthProvider'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import {reviewLabel,REVIEW_NOTICE,type ReviewSummary} from '@/lib/game-distribution/review'
type Row=ReviewSummary&{id:string;gameId:string;title:string;version:string;createdAt:string;editorialComplete:boolean}
export default function DeveloperSubmissions(){const {session,loading}=useAuth()
  if(loading)return <p>Chargement…</p>
  if(!session)return <div className="p-6"><AuthRequired/></div>
  return <List key={session.user.id} token={session.access_token}/>
}
function List({token}:{token:string}){
  const router=useRouter(),locked=useRef(false)
  const [preparing,setPreparing]=useState<string|null>(null)
  async function prepareCorrection(row:Row){
    if(locked.current||!window.confirm('Préparer un nouveau dépôt pour ce jeu ? L’archive et la soumission précédentes seront conservées.'))return
    locked.current=true;setPreparing(row.id);setError('')
    try{const {data}=await developerJson('/api/developer/drafts',token,{method:'POST',body:JSON.stringify({action:'prepare-correction',gameId:row.gameId,uploadId:row.id})})
      router.push(data.mode==='update'?'/publier-un-jeu?mode=update':'/publier-un-jeu?draft='+encodeURIComponent(data.gameId))
    }catch{setError('Impossible de préparer cette correction. Actualisez la liste avant de réessayer.')}finally{locked.current=false;setPreparing(null)}
  }
  const [rows,setRows]=useState<Row[]>([]),[offset,setOffset]=useState(0),[reload,setReload]=useState(0),[error,setError]=useState('')
  useEffect(()=>{const c=new AbortController();developerJson('/api/developer/submissions?offset='+offset,token,{signal:c.signal}).then(b=>{if(!c.signal.aborted){setRows(b.data);setError('')}}).catch(()=>{if(!c.signal.aborted){setRows([]);setError('Impossible de charger les soumissions.')}});return()=>c.abort()},[token,offset,reload])
  return <div className="mx-auto max-w-4xl space-y-5 p-6"><h1 className="text-3xl">Mes soumissions</h1><p>{REVIEW_NOTICE}</p><Link href="/publier-un-jeu">Envoyer un jeu ou une nouvelle version</Link>
    <p>Les anciennes propositions sans build restent conservées dans l’administration. Elles ne sont pas rattachées automatiquement à un compte par email.</p>
    <button onClick={()=>setReload(n=>n+1)}>Actualiser</button>{error&&<p role="alert">{error}</p>}
    {!rows.length&&!error&&<p>Aucun build sur cette page.</p>}
    <ul className="space-y-4">{rows.map(r=><li className="rounded border border-zinc-700 p-4" key={r.id}><Link href={'/developer/builds/'+r.id}>{r.title} — {r.version}</Link><p>{reviewLabel(r)} · {r.createdAt}</p>{r.reason&&<p>{r.reason}</p>}{(['failed','expired'].includes(r.technicalStatus)||r.decision==='pending'&&r.reason)&&!['rejected','archived'].includes(r.decision)&&<button type="button" className="mt-2 rounded border border-cyan-800 px-3 py-2 text-cyan-200 focus-visible:outline focus-visible:outline-cyan-300" disabled={!!preparing} onClick={()=>prepareCorrection(r)}>{preparing===r.id?'Préparation…':'Préparer un build corrigé'}</button>}{!r.editorialComplete&&(['queued','validating','completed'].includes(r.technicalStatus)?<Link href={'/publier-un-jeu?upload='+r.id}>Terminer les informations éditoriales</Link>:<p>Upload incomplet : reprendre dans l’onglet de dépôt avec le même ZIP.</p>)}</li>)}</ul>
    <div className="flex gap-4"><button disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Précédent</button><button disabled={rows.length<50} onClick={()=>setOffset(n=>n+50)}>Suivant</button></div>
  </div>
}

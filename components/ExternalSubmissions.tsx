'use client'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {developerJson,SubmissionError} from '@/lib/game-distribution/browser-upload'
import ExternalGamePlayer from './game-runtime/ExternalGamePlayer'

type Revision = {id:string;gameId:string;title:string;url:string;createdAt:string;status:string;action:string|null;reason:string|null;latest:boolean;updateOnly:boolean}
const statuses:Record<string,string> = {
  pending:'En attente de revue', reviewing:'En cours de revue', accepted:'Approuvée',
  rejected:'Refusée', archived:'Retirée', correction:'Correction demandée', publish:'Publiée',
  suspend:'Suspendue', withdraw:'Retirée',
}
const revisable = new Set(['correction','reject','publish','suspend','withdraw'])

export default function ExternalSubmissions({token,updatesOnly=false}:{token:string;updatesOnly?:boolean}){
  const [rows,setRows]=useState<Revision[]>([])
  const [offset,setOffset]=useState(0),[reload,setReload]=useState(0)
  const [loading,setLoading]=useState(true),[error,setError]=useState(false)
  useEffect(()=>{
    const controller=new AbortController()
    developerJson('/api/developer/submissions/external?offset='+offset,token,{signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted){setRows(data);setError(false);setLoading(false)}})
      .catch(()=>{if(!controller.signal.aborted){setRows([]);setError(true);setLoading(false)}})
    return()=>controller.abort()
  },[token,offset,reload])
  const shown=updatesOnly?rows.filter(row=>row.latest&&row.updateOnly):rows
  return <section className="space-y-3" aria-label="Soumissions externes">
    <h2 className="text-xl">Hébergement externe</h2>
    {loading?<p role="status">Chargement des révisions…</p>:error?<p role="alert">Impossible de charger les révisions externes.</p>:!shown.length?<p>Aucune révision externe sur cette page.</p>:null}
    {shown.map(row=><article key={row.id} className="space-y-2 rounded border border-zinc-700 p-4">
      <h3 className="font-semibold">{row.title}</h3>
      <p>{statuses[row.action??'']??statuses[row.status]??'En attente de revue'}</p>
      <p className="break-all">URL : {row.url}</p>
      <p className="break-all text-sm">Révision {row.id} · {new Date(row.createdAt).toLocaleDateString('fr-FR')}</p>
      {row.reason&&<p>{row.reason}</p>}
      {!updatesOnly&&<details>
        <summary className="cursor-pointer text-cyan-300">Prévisualisation privée</summary>
        <ExternalGamePlayer title={row.title} revisionId={row.id} token={token}/>
      </details>}
      {row.latest&&row.action&&revisable.has(row.action)&&(row.updateOnly
        ? <RevisionForm key={row.id} row={row} token={token} onSubmitted={()=>{setOffset(0);setReload(n=>n+1)}}/>
        : <Link className="text-cyan-300 underline" href={'/publier-un-jeu?hosting=external&draft='+encodeURIComponent(row.gameId)}>Soumettre une nouvelle URL depuis le brouillon</Link>)}
    </article>)}
    <div className="flex gap-4">
      <button type="button" disabled={!offset} onClick={()=>setOffset(n=>n-50)}>Précédent</button>
      <button type="button" disabled={rows.length<50} onClick={()=>setOffset(n=>n+50)}>Suivant</button>
      <button type="button" onClick={()=>setReload(n=>n+1)}>Actualiser</button>
    </div>
  </section>
}

function RevisionForm({row,token,onSubmitted}:{row:Revision;token:string;onSubmitted:()=>void}){
  const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const request=useRef<string|null>(null),locked=useRef(false)
  async function submit(){
    if(locked.current)return
    locked.current=true;setBusy(true);setError('')
    try{
      await developerJson('/api/developer/submissions/external',token,{method:'POST',
        body:JSON.stringify({gameId:row.gameId,revisionId:request.current??=crypto.randomUUID(),url,ownership:true})})
      setUrl('');request.current=null;onSubmitted()
    }catch(cause){
      setError(cause instanceof SubmissionError&&cause.code==='invalid_external_game_url'
        ?'Saisissez une URL HTTPS publique valide.':'Impossible de soumettre cette révision. Actualisez le dossier avant de réessayer.')
    }finally{locked.current=false;setBusy(false)}
  }
  return <details>
    <summary className="cursor-pointer text-cyan-300">Soumettre une nouvelle URL</summary>
    <form className="mt-3 space-y-2" onSubmit={event=>{event.preventDefault();void submit()}}>
      <label className="block">Nouvelle URL HTTPS<input className="block w-full rounded border border-zinc-700 bg-zinc-950 p-2" type="url" required maxLength={2048} value={url} disabled={busy}
        onChange={event=>{setUrl(event.target.value);request.current=null;setError('')}}/></label>
      <label className="block"><input type="checkbox" required disabled={busy}/> Je dispose des droits de diffusion.</label>
      <button type="submit" disabled={busy} className="rounded border border-cyan-700 px-3 py-2">{busy?'Envoi…':'Envoyer pour revue'}</button>
      {error&&<p role="alert">{error}</p>}
    </form>
  </details>
}

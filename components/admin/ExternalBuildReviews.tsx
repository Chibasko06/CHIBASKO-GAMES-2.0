'use client'

import {useEffect,useRef,useState} from 'react'
import ExternalGamePlayer from '@/components/game-runtime/ExternalGamePlayer'
import {reviewDate} from '@/lib/game-distribution/admin-review-presentation'
import {ReviewCard,reviewButton} from './ReviewPrimitives'

type Action='approve'|'publish'|'correction'|'reject'|'suspend'|'withdraw'
type Revision={
  id:string;title:string;developer:string;url:string;origin:string;createdAt:string
  status:string;current:boolean;published:boolean;latest:boolean
  history:{action:Action;reason:string|null;origin:string|null;at:string;actor:string|null}[]
}

const labels:Record<Action,string>={
  approve:'Approuver la révision',publish:'Publier cette révision',correction:'Demander une correction',
  reject:'Refuser la révision',suspend:'Suspendre le jeu',withdraw:'Retirer le jeu',
}
const requiresReason=new Set<Action>(['correction','reject','suspend','withdraw'])
const field='mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2'
const endpoint='/api/admin/game-builds/external'

function available(row:Revision):Action[]{
  const last=row.history[0]?.action
  const actions:Action[]=[]
  if(row.latest&&!last&&['pending','reviewing'].includes(row.status))actions.push('approve','correction','reject')
  if(row.latest&&last==='approve'&&row.status==='accepted')actions.push('publish')
  if(row.current&&last==='publish'&&row.published)actions.push('suspend')
  if(row.current&&(last==='publish'||last==='suspend'))actions.push('withdraw')
  return actions
}

export default function ExternalBuildReviews({token,refresh}:{token?:string;refresh:number}){
  const [rows,setRows]=useState<Revision[]>([]),[offset,setOffset]=useState(0)
  const [selected,setSelected]=useState<string>(),[pending,setPending]=useState(false)
  const [error,setError]=useState(''),[reload,setReload]=useState(0)
  useEffect(()=>{
    if(!token)return
    const abort=new AbortController()
    fetch(endpoint+'?offset='+offset,{headers:{Authorization:'Bearer '+token},cache:'no-store',
      signal:AbortSignal.any([abort.signal,AbortSignal.timeout(15_000)])})
      .then(async response=>{if(!response.ok)throw Error();return response.json()})
      .then(({data})=>{if(!abort.signal.aborted){setRows(data);setPending(false);setError('')}})
      .catch(()=>{if(!abort.signal.aborted){setRows([]);setPending(false);setError('Impossible de charger les révisions externes.')}})
    return()=>abort.abort()
  },[token,offset,refresh,reload])
  if(!token)return null
  const row=rows.find(item=>item.id===selected)
  return <ReviewCard title="Soumissions hébergées à l’extérieur">
    {error&&<p role="alert">{error}</p>}
    {!rows.length&&!error&&<p>Aucune révision externe sur cette page.</p>}
    <ul className="space-y-2">{rows.map(item=><li key={item.id}>
      <button type="button" className={reviewButton} disabled={pending} aria-expanded={selected===item.id}
        onClick={()=>setSelected(selected===item.id?undefined:item.id)}>{item.title} · {reviewDate(item.createdAt)} · {item.published?'En ligne':item.status==='pending'?'En attente':item.history[0]?labels[item.history[0].action]:'À examiner'}</button>
    </li>)}</ul>
    <div className="flex gap-2">
      <button type="button" className={reviewButton} disabled={!offset||pending} onClick={()=>setOffset(n=>n-50)}>Précédent</button>
      <button type="button" className={reviewButton} disabled={rows.length<50||pending} onClick={()=>setOffset(n=>n+50)}>Suivant</button>
    </div>
    {row&&<RevisionDetails key={row.id} row={row} token={token} refreshing={pending}
      onSaved={()=>{setPending(true);setReload(n=>n+1)}}/>}
  </ReviewCard>
}

function RevisionDetails({row,token,onSaved,refreshing}:{row:Revision;token:string;onSaved:()=>void;refreshing:boolean}){
  const [preview,setPreview]=useState(false),[origin,setOrigin]=useState(''),[checked,setChecked]=useState(false)
  const [reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const locked=useRef(false)
  const actions=available(row)
  async function decide(action:Action){
    if(locked.current||refreshing||!actions.includes(action))return
    if(requiresReason.has(action)&&!reason.trim()){setError('Indiquez le motif de la décision.');return}
    if(action==='approve'&&(!checked||origin!==row.origin)){setError('Confirmez les contrôles manuels et saisissez l’origine examinée. Elle doit correspondre à l’origine enregistrée.');return}
    if(!window.confirm(labels[action]+' pour « '+row.title+' » ?'))return
    locked.current=true;setBusy(true);setError('');setNotice('')
    try{
      const response=await fetch(endpoint,{method:'POST',cache:'no-store',signal:AbortSignal.timeout(30_000),
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({action,revisionId:row.id,...(requiresReason.has(action)?{reason}:{}),
          ...(action==='approve'?{origin,checked}:{})})})
      const result=await response.json()
      if(!response.ok)throw Error(typeof result.error==='string'?result.error:'Décision refusée.')
      setNotice('Décision enregistrée.');setPreview(false);setReason('');setChecked(false);setOrigin('')
      onSaved()
    }catch(cause){setError(cause instanceof Error?cause.message:'Impossible d’enregistrer cette décision.')}
    finally{locked.current=false;setBusy(false)}
  }
  return <section className="space-y-4 border-t border-zinc-700 pt-4">
    <h3 className="text-lg font-semibold">{row.title} · HTML5 classique externe</h3>
    <p>{row.developer} · Déposé le {reviewDate(row.createdAt)}</p>
    <p className="break-all">Version de dépôt {row.id}</p>
    <p className="break-all">URL enregistrée : {row.url}</p>
    <p className="break-all">Origine déclarée : {row.origin}</p>
    <p>{row.published?'Cette révision est actuellement publique.':row.current?'Cette révision est rattachée au jeu et indisponible au public.':'Cette révision n’est pas celle actuellement servie au public.'}</p>
    <button type="button" className={reviewButton} onClick={()=>setPreview(!preview)}>{preview?'Fermer le test':'Ouvrir la prévisualisation privée'}</button>
    {preview&&<ExternalGamePlayer title={row.title} revisionId={row.id} token={token}/>}
    {actions.includes('approve')&&<fieldset className="space-y-2">
      <legend className="font-semibold">Contrôles manuels avant approbation</legend>
      <p>Vérifiez la destination finale, la compatibilité iframe, le démarrage, les commandes, l’audio et les ressources. Essayez la navigation, le stockage et les téléchargements lorsqu’ils sont proposés. Le contenu externe peut changer après la revue.</p>
      <label className="block">Origine HTTPS examinée<input className={field} value={origin} maxLength={2048} onChange={event=>setOrigin(event.target.value)}/></label>
      <label className="block"><input type="checkbox" checked={checked} onChange={event=>setChecked(event.target.checked)}/> J’ai effectué les contrôles manuels applicables à cette révision.</label>
    </fieldset>}
    {actions.some(action=>requiresReason.has(action))&&<label className="block">Motif de la décision<textarea className={field} value={reason} maxLength={2000} onChange={event=>setReason(event.target.value)}/></label>}
    {actions.includes('reject')&&<p>Refuser cette révision ne retire pas une autre révision déjà publiée.</p>}
    <div className="flex flex-wrap gap-2">{actions.map(action=><button type="button" key={action} className={reviewButton} disabled={busy||refreshing}
      onClick={()=>void decide(action)}>{labels[action]}</button>)}</div>
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <details><summary>Historique de la révision</summary>
      {!row.history.length&&<p>Aucune décision enregistrée.</p>}
      <ul className="space-y-2">{row.history.map((event,index)=><li key={event.at+':'+index}>
        {reviewDate(event.at)} · {labels[event.action]}{event.reason&&<p>{event.reason}</p>}
        {event.origin&&<p>Contrôles manuels attestés pour {event.origin}.</p>}
      </li>)}</ul>
    </details>
  </section>
}

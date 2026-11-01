'use client'
import {useEffect,useState} from 'react'
import {fetchJson} from '@/lib/asyncOperation'
import {socialButton} from '@/lib/social'

export type FactsInput={factId?:string;factsRevision?:number;factsKey?:string;factsSummary?:string}
type Fact={archived_at?:string|null;id:string;reference:string;summary:string;revision:number;state:string;decided:boolean;created_at:string}
const field='mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black p-3'
export default function ModerationFacts({token,kind,target,caseId,disabled,onChange}:{token:string;kind:string;target:string;caseId?:string;disabled:boolean;onChange:(value:FactsInput|null)=>void}){
 const [items,setItems]=useState<Fact[]>([]),[selected,setSelected]=useState(''),[reference,setReference]=useState(''),[summary,setSummary]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(true),[revision,setRevision]=useState(0),[more,setMore]=useState(false),[cursor,setCursor]=useState<{before:string;cursor:string}|null>(null)
 useEffect(()=>{let active=true;onChange(null)
  void fetchJson('/api/admin/moderation/facts?'+new URLSearchParams({kind,target,...caseId?{caseId}:{},...cursor}),{headers:{Authorization:'Bearer '+token}}).then(({response,payload})=>{if(!response.ok)throw Error(payload.error??'Faits indisponibles.');if(active){setItems(payload.data.items);setMore(payload.data.hasMore);setError('');setBusy(false)}}).catch(cause=>{if(active){setError(cause instanceof Error?cause.message:'Faits indisponibles.');setBusy(false)}})
  return()=>{active=false}
 },[token,kind,target,caseId,cursor,revision,onChange])
 const fact=items.find(item=>item.id===selected),ready=!busy&&!error&&!disabled&&(!selected||!!fact)
 useEffect(()=>{onChange(!ready?null:fact?fact.state==='open'&&!fact.decided&&!fact.archived_at?{factId:fact.id,factsRevision:fact.revision}:null:!caseId&&reference.trim().length>=4&&summary.trim().length>=20?{factsKey:reference,factsSummary:summary}:caseId&&!items.length?{}:null)},[ready,fact,reference,summary,caseId,items.length,onChange])
 async function reopen(){if(!fact||busy||disabled||!window.confirm('Réouvrir ces mêmes faits ? La justification sera conservée. Une nouvelle décision ne doit pas répéter sans motif celle déjà réexaminée.'))return;setBusy(true);onChange(null)
  try{const {response,payload}=await fetchJson('/api/admin/moderation/facts',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:fact.id,revision:fact.revision,operationId:crypto.randomUUID(),reason})});if(!response.ok)throw Error(payload.error??'Réouverture non confirmée.');setRevision(value=>value+1);setReason('')}
  catch(cause){setError(cause instanceof Error?cause.message:'Réouverture non confirmée.');setBusy(false)}
 }
 return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-cyan-900 p-4"><legend className="px-2 font-semibold">Faits examinés</legend><p className="text-sm text-zinc-400">Une décision par révision des faits. Un recours accepté clôt les faits concernés ; il ne retire pas automatiquement la sanction. Des faits distincts permettent une nouvelle mesure.</p>
  {error&&<p role="alert">{error}</p>}{busy&&<p role="status">Chargement des faits…</p>}
  <label className="block">Affaire<select aria-label="Affaire" className={field} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">{caseId?'Faits du signalement':'Faits nouveaux, distincts des décisions antérieures'}</option>{items.map(item=><option key={item.id} value={item.id}>{item.reference} · révision {item.revision} · {item.state==='closed'?'clos':item.decided?'déjà jugés':'rouverts'}</option>)}</select></label>
  {!caseId&&!selected&&<><label className="block">Référence stable des faits<input className={field} required minLength={4} maxLength={120} value={reference} onChange={event=>setReference(event.target.value)}/></label><label className="block">Description des faits nouveaux<textarea className={field} required minLength={20} maxLength={5000} value={summary} onChange={event=>setSummary(event.target.value)}/></label></>}
  {selected&&!fact&&!busy&&<p role="status">L’affaire sélectionnée n’est pas sur cette page. Sélectionne explicitement une affaire avant de décider.</p>}
  {fact&&<p className="whitespace-pre-wrap break-words text-sm">{fact.summary}</p>}
  {fact?.archived_at&&<p>Les justificatifs de cette affaire ont été archivés. Seuls des faits nouveaux documentés peuvent faire l’objet d’une nouvelle mesure.</p>}
  {fact&&!fact.archived_at&&(fact.state==='closed'||fact.decided)&&<><p className="text-amber-200">Nouvelle mesure bloquée sur cette révision. Une réouverture motivée est nécessaire pour réexaminer les mêmes faits.</p><label className="block">Justification de réouverture<textarea className={field} minLength={10} maxLength={5000} value={reason} onChange={event=>setReason(event.target.value)}/></label><button type="button" className={socialButton} disabled={busy||reason.trim().length<10} onClick={()=>void reopen()}>Réouvrir explicitement les faits</button></>}
  {caseId&&!selected&&items.length>0&&<p className="text-amber-200">Sélectionne les faits du dossier avant de décider.</p>}
  <div className="flex flex-wrap gap-3"><button type="button" disabled={busy||!cursor} className={socialButton} onClick={()=>{setBusy(true);setCursor(null)}}>Affaires récentes</button><button type="button" disabled={busy||!more} className={socialButton} onClick={()=>{const last=items.at(-1);if(last){setBusy(true);setCursor({before:last.created_at,cursor:last.id})}}}>Affaires antérieures</button><button type="button" disabled={busy} className={socialButton} onClick={()=>{setBusy(true);setRevision(value=>value+1)}}>Recharger les faits</button></div>
 </fieldset>
}

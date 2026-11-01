'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {fetchJson} from '@/lib/asyncOperation'
import Link from 'next/link'
import ModerationFacts,{type FactsInput} from './ModerationFacts'
import {moderationMeasureActions as labels,moderationMeasureNames,reportCategories,moderationStates,type ModerationState} from '@/lib/moderation'
import {socialButton} from '@/lib/social'

type Event={withdrawal?:{reason:string;created_at:string}|null;facts?:{reference:string;state:string;revision:number}|null;appeal?:{state:string;effect?:string|null}|null;id:string;action:string;reason:string;note:string|null;created_at:string;ends_at:string|null;mail?:{kind:string;state:string;attempts:number}[]}
type Target={name:string|null;version:number;blocked:boolean;protected?:boolean;published?:boolean|null;measure:string|null;endsAt:string|null;history:Event[];reports?:{id:string;number:number;state:ModerationState;category:string;created_at:string}[]}
export default function ModerationMeasures({token,target,kind,caseId,subject,creationEnabled=false,onChanged,caseVersion,initialAction}:{token:string;target:string;kind:'player'|'game';caseId?:string;subject?:string;creationEnabled?:boolean;caseVersion?:number;initialAction?:string;onChanged?:(value:Target|undefined)=>void}){
 const [data,setData]=useState<Target|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [formOpen,setFormOpen]=useState(!!initialAction),[receipt,setReceipt]=useState<{id:string;action:string}|null>(null)
 const [action,setAction]=useState(initialAction&&['lift','restore'].includes(initialAction)?initialAction:kind==='player'?'warn':'unpublish'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[duration,setDuration]=useState('24'),[custom,setCustom]=useState(''),[before,setBefore]=useState<{before:string;cursor:string}|null>(null)
 const [facts,setFacts]=useState<FactsInput|null>(null)
 const actionField=useRef<HTMLSelectElement>(null),receiptLink=useRef<HTMLAnchorElement>(null),hasData=data!==null
 const epoch=useRef(0),locked=useRef(false),attempt=useRef<{body:string;form:string;operationId:string}|null>(null)
 const invalidate=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{const version=++epoch.current;let active=true;locked.current=true
  void Promise.resolve().then(async()=>{if(!active)return;setBusy(true);setError('');const {response,payload}=await fetchJson('/api/admin/moderation/measures?'+new URLSearchParams({...subject?{subject}:{kind,target},...before}),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error(payload.error??'Mesures indisponibles.');if(active&&version===epoch.current){attempt.current=null;setData(payload.data)}})
   .catch(cause=>{if(active&&version===epoch.current)setError(cause instanceof Error?cause.message:'Chargement impossible.')})
   .finally(()=>{if(active&&version===epoch.current){setBusy(false);locked.current=false}})
  return()=>{active=false;invalidate()}
 },[token,target,kind,revision,before,subject,caseVersion,invalidate])
 useEffect(()=>{if(formOpen&&hasData)actionField.current?.focus()},[formOpen,hasData])
 useEffect(()=>{if(receipt)receiptLink.current?.focus()},[receipt])
 const effectiveAction=creationEnabled?action:kind==='player'?'lift':'restore'
 async function submit(event:React.FormEvent){
  event.preventDefault();if(locked.current||!data)return
  const body={...facts,kind,target,action:effectiveAction,version:data.version,reason,note,...(caseId?{caseId}:{}),...(effectiveAction==='suspend'?{endsAt:duration==='custom'?new Date(custom).toISOString():new Date(Date.now()+Number(duration)*3600000).toISOString()}:{})}
  const text=JSON.stringify(body),form=JSON.stringify({kind,target,action,reason,note,duration,custom,caseId,facts})
  if(attempt.current&&attempt.current.form!==form){setError('Actualise l’état de la cible avant de modifier une décision non confirmée.');return}
  if(!window.confirm(labels[effectiveAction]+' ? '+(effectiveAction==='warn'?'L’accès reste autorisé.':effectiveAction==='lift'||effectiveAction==='restore'?'Les autorisations normales s’appliqueront à nouveau.':'Les nouvelles opérations concernées seront refusées. Les données et fichiers publiés seront conservés.')+' Le motif sera communiqué.'))return
  attempt.current??={body:text,form,operationId:crypto.randomUUID()};locked.current=true;setBusy(true);setError('');const version=epoch.current
  try{const {response,payload}=await fetchJson('/api/admin/moderation/measures',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(attempt.current.body),operationId:attempt.current.operationId})});if(!response.ok){if(response.status>=400&&response.status<500)attempt.current=null;throw Error(payload.error??'Décision non confirmée.')}if(version!==epoch.current)return;attempt.current=null;setReason('');setNote('');setBefore(null);setFormOpen(false);setReceipt({id:payload.data.id,action:effectiveAction});const current=payload.data?.current as Target|undefined;if(current&&typeof current.version==='number'&&Array.isArray(current.history))setData(current);else setRevision(value=>value+1);onChanged?.(current)}
  catch(cause){if(version===epoch.current)setError(cause instanceof Error?cause.message:'Décision non confirmée.')}
  finally{if(version===epoch.current){locked.current=false;setBusy(false)}}
 }
 const blocked=data?.blocked===true
 return <section aria-busy={busy} className="space-y-4 rounded-2xl border border-rose-900/50 bg-zinc-950 p-4 sm:p-6"><header className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Fiche de modération {data?.name?'— '+(kind==='player'?'@':'')+data.name:''}</h2><button disabled={busy} type="button" className={socialButton} onClick={()=>{setRevision(value=>value+1)}}>Actualiser la cible</button></header>
  <p className="text-sm text-zinc-400">{blocked?'Restriction active : '+moderationMeasureNames[data!.measure!]+(data?.endsAt?' jusqu’au '+new Date(data.endsAt).toLocaleString('fr-FR'):''):'Aucune restriction active.'}</p>
  {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}{busy&&<p role="status">Vérification…</p>}
  {data?.protected&&<p className="text-sm text-amber-200">Ce compte administratif est protégé contre les sanctions.</p>}
  {!creationEnabled&&<p className="text-sm text-zinc-400">La création de mesures est désactivée. Les levées, restaurations et recours restent disponibles.</p>}
  {receipt&&<div role="status" className="space-y-2 rounded-lg border border-cyan-800 bg-cyan-950/20 p-4"><p>Décision enregistrée : {moderationMeasureNames[receipt.action]}. La cible reste sélectionnée ; un signalement associé n’est pas clôturé automatiquement.</p><Link ref={receiptLink} className="font-semibold text-cyan-200 underline" href={'/admin/moderation?view=measures&measure='+receipt.id}>Consulter l’historique de la mesure</Link></div>}
  {data&&!subject&&!data.protected&&(creationEnabled||data.blocked)&&!formOpen&&<button className={socialButton} disabled={busy} onClick={()=>{setFormOpen(true);setReceipt(null)}}>{creationEnabled?'Prendre une mesure — faits nouveaux ou réexamen':kind==='player'?'Lever la restriction':'Restaurer le jeu'}</button>}
  {data&&!subject&&!data.protected&&(creationEnabled||data.blocked)&&formOpen&&<form onSubmit={submit} className="space-y-4"><label className="block text-sm">Mesure<select ref={actionField} aria-label="Mesure" disabled={busy} value={effectiveAction} onChange={event=>setAction(event.target.value)} className={field}>{(creationEnabled?(kind==='player'?['warn','suspend','ban','lift']:['unpublish','restore']):(kind==='player'?['lift']:['restore'])).map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
   {!['lift','restore'].includes(effectiveAction)&&<ModerationFacts token={token} kind={kind} target={target} caseId={caseId} disabled={busy} onChange={setFacts}/>}
   {effectiveAction==='suspend'&&<div className="grid gap-3 sm:grid-cols-2"><label>Durée<select aria-label="Durée" disabled={busy} value={duration} onChange={event=>setDuration(event.target.value)} className={field}><option value="24">24 heures</option><option value="168">7 jours</option><option value="720">30 jours</option><option value="custom">Date personnalisée</option></select></label>{duration==='custom'&&<label>Fin de suspension (heure locale)<input disabled={busy} type="datetime-local" required value={custom} onChange={event=>setCustom(event.target.value)} className={field}/></label>}</div>}
   <label className="block text-sm">Motif communiqué à la personne concernée<textarea disabled={busy} required minLength={10} maxLength={5000} value={reason} onChange={event=>setReason(event.target.value)} className={field+' min-h-28'}/></label>
   <label className="block text-sm">Note privée sur la mesure<textarea disabled={busy} maxLength={5000} value={note} onChange={event=>setNote(event.target.value)} className={field+' min-h-24'}/></label>
   <p className="text-xs leading-5 text-zinc-400">Une suspension peut être prolongée. Un bannissement doit être levé avant une suspension. Une levée ne restaure pas les anciennes sessions de jeu. Cette action ne classe pas automatiquement le signalement.</p>
   <div className="flex flex-wrap gap-3"><button disabled={busy||(!['lift','restore'].includes(effectiveAction)&&!facts)} className={socialButton}>Confirmer la mesure</button><button type="button" disabled={busy} className={socialButton} onClick={()=>setFormOpen(false)}>Revenir à la fiche</button></div></form>}
  {!formOpen&&!!data?.reports?.length&&<section className="space-y-3"><h4 className="font-semibold">Signalements récents liés à cette cible</h4><ul className="space-y-2 text-sm">{data.reports.map(report=><li key={report.id}><Link className="text-cyan-200 underline" href={'/admin/moderation?id='+report.id}>Dossier #{report.number}</Link> · {moderationStates[report.state]} · {(reportCategories[kind] as Record<string,string>)[report.category]??'Autre'} · {new Date(report.created_at).toLocaleDateString('fr-FR')}</li>)}</ul></section>}
  {!formOpen&&<><h3 className="font-semibold">Historique des sanctions et avertissements</h3><ol className="space-y-3">{data?.history.map(item=><li key={item.id} className="rounded-lg border border-zinc-800 p-3 text-sm"><p className="font-medium">{moderationMeasureNames[item.action]} · {new Date(item.created_at).toLocaleString('fr-FR')}</p><p className="my-2 whitespace-pre-wrap break-words">{item.reason}</p>{item.withdrawal&&<p className="text-cyan-200">Avertissement retiré : {item.withdrawal.reason}</p>}{item.facts&&<p>Faits : {item.facts.reference} · révision {item.facts.revision} · {item.facts.state==='closed'?'clos après réexamen':'ouverts'}</p>}{item.appeal?.state==='accepted'&&<p>Recours accepté. Consulter le détail pour son effet explicite.</p>}<Link className="text-cyan-200 underline" href={'/admin/moderation?view=measures&measure='+item.id}>Ouvrir la mesure et ses notifications</Link></li>)}</ol>
  {data&&!data.history.length&&<p className="text-sm text-zinc-400">Aucune sanction ni avertissement enregistré pour cette cible.</p>}
  <div className="flex flex-wrap gap-3"><button disabled={busy||!before} className={socialButton} onClick={()=>setBefore(null)}>Mesures récentes</button><button disabled={busy||data?.history.length!==20} className={socialButton} onClick={()=>{const last=data?.history.at(-1);if(last)setBefore({before:last.created_at,cursor:last.id})}}>Mesures antérieures</button></div></>}
 </section>
}
export const field='mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black p-3 text-zinc-100 focus-visible:outline-cyan-400'

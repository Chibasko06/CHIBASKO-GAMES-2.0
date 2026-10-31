'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {fetchJson} from '@/lib/asyncOperation'
import Link from 'next/link'
import {moderationMeasureActions as labels,moderationMeasureNames,reportCategories,moderationStates,type ModerationState} from '@/lib/moderation'
import {socialButton} from '@/lib/social'

type Event={id:string;action:string;reason:string;note:string|null;created_at:string;ends_at:string|null;mail?:{kind:string;state:string;attempts:number}[]}
type Target={name:string|null;version:number;blocked:boolean;protected?:boolean;published?:boolean|null;measure:string|null;endsAt:string|null;history:Event[];reports?:{id:string;number:number;state:ModerationState;category:string;created_at:string}[]}
export default function ModerationMeasures({token,target,kind,caseId,subject,creationEnabled=false,onChanged,caseVersion}:{token:string;target:string;kind:'player'|'game';caseId?:string;subject?:string;creationEnabled?:boolean;caseVersion?:number;onChanged?:(value:Target|undefined)=>void}){
 const [data,setData]=useState<Target|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [action,setAction]=useState(kind==='player'?'warn':'unpublish'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[duration,setDuration]=useState('24'),[custom,setCustom]=useState(''),[before,setBefore]=useState<{before:string;cursor:string}|null>(null)
 const epoch=useRef(0),locked=useRef(false),attempt=useRef<{body:string;form:string;operationId:string}|null>(null)
 const invalidate=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{const version=++epoch.current;let active=true;locked.current=true
  void Promise.resolve().then(async()=>{if(!active)return;setBusy(true);setError('');const {response,payload}=await fetchJson('/api/admin/moderation/measures?'+new URLSearchParams({...subject?{subject}:{kind,target},...before}),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error(payload.error??'Mesures indisponibles.');if(active&&version===epoch.current){attempt.current=null;setData(payload.data)}})
   .catch(cause=>{if(active&&version===epoch.current)setError(cause instanceof Error?cause.message:'Chargement impossible.')})
   .finally(()=>{if(active&&version===epoch.current){setBusy(false);locked.current=false}})
  return()=>{active=false;invalidate()}
 },[token,target,kind,revision,before,subject,caseVersion,invalidate])
 const effectiveAction=creationEnabled?action:kind==='player'?'lift':'restore'
 async function submit(event:React.FormEvent){
  event.preventDefault();if(locked.current||!data)return
  const body={kind,target,action:effectiveAction,version:data.version,reason,note,...(caseId?{caseId}:{}),...(effectiveAction==='suspend'?{endsAt:duration==='custom'?new Date(custom).toISOString():new Date(Date.now()+Number(duration)*3600000).toISOString()}:{})}
  const text=JSON.stringify(body),form=JSON.stringify({kind,target,action,reason,note,duration,custom,caseId})
  if(attempt.current&&attempt.current.form!==form){setError('Actualise l’état de la cible avant de modifier une décision non confirmée.');return}
  if(!window.confirm(labels[effectiveAction]+' ? '+(effectiveAction==='warn'?'L’accès reste autorisé.':effectiveAction==='lift'||effectiveAction==='restore'?'Les autorisations normales s’appliqueront à nouveau.':'Les nouvelles opérations concernées seront refusées. Les données et fichiers publiés seront conservés.')+' Le motif sera communiqué.'))return
  attempt.current??={body:text,form,operationId:crypto.randomUUID()};locked.current=true;setBusy(true);setError('');const version=epoch.current
  try{const {response,payload}=await fetchJson('/api/admin/moderation/measures',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...JSON.parse(attempt.current.body),operationId:attempt.current.operationId})});if(!response.ok){if(response.status>=400&&response.status<500)attempt.current=null;throw Error(payload.error??'Décision non confirmée.')}if(version!==epoch.current)return;attempt.current=null;setReason('');setNote('');setBefore(null);const current=payload.data?.current as Target|undefined;if(current&&typeof current.version==='number'&&Array.isArray(current.history))setData(current);else setRevision(value=>value+1);onChanged?.(current)}
  catch(cause){if(version===epoch.current)setError(cause instanceof Error?cause.message:'Décision non confirmée.')}
  finally{if(version===epoch.current){locked.current=false;setBusy(false)}}
 }
 const blocked=data?.blocked===true
 return <section aria-busy={busy} className="space-y-4 rounded-2xl border border-rose-900/50 bg-zinc-950 p-4 sm:p-6"><header className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Mesures administratives {data?.name?'— '+data.name:''}</h3><button disabled={busy} type="button" className={socialButton} onClick={()=>{setRevision(value=>value+1)}}>Actualiser la cible</button></header>
  <p className="text-sm text-zinc-400">{blocked?'Restriction active : '+moderationMeasureNames[data!.measure!]+(data?.endsAt?' jusqu’au '+new Date(data.endsAt).toLocaleString('fr-FR'):''):'Aucune restriction active.'}</p>
  {error&&<p role="alert" className="text-sm text-red-200">{error}</p>}{busy&&<p role="status">Vérification…</p>}
  {data?.protected&&<p className="text-sm text-amber-200">Ce compte administratif est protégé contre les sanctions.</p>}
  {!creationEnabled&&<p className="text-sm text-zinc-400">La création de mesures est désactivée. Les levées, restaurations et recours restent disponibles.</p>}
  {data&&!subject&&!data.protected&&(creationEnabled||data.blocked)&&<form onSubmit={submit} className="space-y-4"><label className="block text-sm">Mesure<select aria-label="Mesure" disabled={busy} value={effectiveAction} onChange={event=>setAction(event.target.value)} className={field}>{(creationEnabled?(kind==='player'?['warn','suspend','ban','lift']:['unpublish','restore']):(kind==='player'?['lift']:['restore'])).map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label>
   {effectiveAction==='suspend'&&<div className="grid gap-3 sm:grid-cols-2"><label>Durée<select aria-label="Durée" disabled={busy} value={duration} onChange={event=>setDuration(event.target.value)} className={field}><option value="24">24 heures</option><option value="168">7 jours</option><option value="720">30 jours</option><option value="custom">Date personnalisée</option></select></label>{duration==='custom'&&<label>Fin de suspension (heure locale)<input disabled={busy} type="datetime-local" required value={custom} onChange={event=>setCustom(event.target.value)} className={field}/></label>}</div>}
   <label className="block text-sm">Motif communiqué à la personne concernée<textarea disabled={busy} required minLength={10} maxLength={5000} value={reason} onChange={event=>setReason(event.target.value)} className={field+' min-h-28'}/></label>
   <label className="block text-sm">Note privée sur la mesure<textarea disabled={busy} maxLength={5000} value={note} onChange={event=>setNote(event.target.value)} className={field+' min-h-24'}/></label>
   <p className="text-xs leading-5 text-zinc-400">Une suspension peut être prolongée. Un bannissement doit être levé avant une suspension. Une levée ne restaure pas les anciennes sessions de jeu. Cette action ne classe pas automatiquement le signalement.</p>
   <button disabled={busy} className={socialButton}>Confirmer la mesure</button></form>}
  {!!data?.reports?.length&&<section className="space-y-3"><h4 className="font-semibold">Signalements récents liés à cette cible</h4><ul className="space-y-2 text-sm">{data.reports.map(report=><li key={report.id}><Link className="text-cyan-200 underline" href={'/admin/moderation?id='+report.id}>Dossier #{report.number}</Link> · {moderationStates[report.state]} · {(reportCategories[kind] as Record<string,string>)[report.category]??'Autre'} · {new Date(report.created_at).toLocaleDateString('fr-FR')}</li>)}</ul></section>}
  <h4 className="font-semibold">Historique des mesures</h4><ol className="space-y-3">{data?.history.map(item=><li key={item.id} className="rounded-lg border border-zinc-800 p-3 text-sm"><p className="font-medium">{moderationMeasureNames[item.action]} · {new Date(item.created_at).toLocaleString('fr-FR')}</p><p className="mt-2 whitespace-pre-wrap break-words">{item.reason}</p>{item.mail?.map((mail,index)=><p key={index} className="mt-2 text-xs text-zinc-400">Notification : {mail.state==='sent'?'acceptée par le service d’envoi':mail.state==='attention_required'?'vérification manuelle nécessaire':'en attente d’envoi ou de confirmation'} · {mail.attempts} tentative(s)</p>)}{item.note&&<p className="mt-2 whitespace-pre-wrap break-words text-amber-200">Note privée : {item.note}</p>}</li>)}</ol>
  <div className="flex flex-wrap gap-3"><button disabled={busy||!before} className={socialButton} onClick={()=>setBefore(null)}>Mesures récentes</button><button disabled={busy||data?.history.length!==20} className={socialButton} onClick={()=>{const last=data?.history.at(-1);if(last)setBefore({before:last.created_at,cursor:last.id})}}>Mesures antérieures</button></div>
 </section>
}
export const field='mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black p-3 text-zinc-100 focus-visible:outline-cyan-400'

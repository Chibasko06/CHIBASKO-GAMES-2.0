'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {fetchJson} from '@/lib/asyncOperation'
import {socialButton} from '@/lib/social'
import Link from 'next/link'
import {field} from './ModerationMeasures'

type Appeal={subject?:string;kind?:string;game_id?:string|null;game_title?:string|null;id:string;version:number;subject_version:number;user_id:string|null;username:string|null;description:string;action:string;reason:string;created_at:string}
export default function ModerationAppeals({token}:{token:string}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<Appeal[]>([]),[selected,setSelected]=useState<Appeal|null>(null),[decision,setDecision]=useState(''),[state,setState]=useState('rejected'),[lift,setLift]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0),[cursor,setCursor]=useState<{before:string;cursor:string}|null>(null)
 const epoch=useRef(0),locked=useRef(false)
 const invalidate=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{if(!open)return;let active=true;const version=++epoch.current;locked.current=true
  void Promise.resolve().then(async()=>{if(!active)return;setBusy(true);const {response,payload}=await fetchJson('/api/admin/moderation/appeals?'+new URLSearchParams(cursor??{}),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error(payload.error??'Recours indisponibles.');if(active&&version===epoch.current){setItems(payload.data);setError('')}})
   .catch(cause=>{if(active&&version===epoch.current)setError(cause instanceof Error?cause.message:'Chargement impossible.')}).finally(()=>{if(active&&version===epoch.current){setBusy(false);locked.current=false}})
  return()=>{active=false;invalidate()}
 },[token,open,revision,cursor,invalidate])
 async function submit(event:React.FormEvent){
  event.preventDefault();if(locked.current||!selected)return
  if(!window.confirm((state==='accepted'?'Accepter':'Rejeter')+' ce recours ? '+(lift?'La restriction active sera explicitement levée.':'Aucune levée automatique de sanction.')+' La décision sera communiquée.'))return
  locked.current=true;setBusy(true);setError('');const version=epoch.current
  try{const {response,payload}=await fetchJson('/api/admin/moderation/appeals',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({id:selected.id,version:selected.version,state,decision,lift,subjectVersion:selected.subject_version,operationId:crypto.randomUUID()})});if(!response.ok)throw Error(payload.error??'Réexamen non confirmé.');if(version===epoch.current){setSelected(null);setRevision(value=>value+1)}}
  catch(cause){if(version===epoch.current)setError((cause instanceof Error?cause.message:'Réexamen non confirmé.')+' Recharge les recours avant de réessayer.')}
  finally{if(version===epoch.current){locked.current=false;setBusy(false)}}
 }
 return <section className="space-y-4 rounded-2xl border border-zinc-800 p-4 sm:p-6"><button className={socialButton} disabled={busy} onClick={()=>{setOpen(value=>!value);setSelected(null)}}>{open?'Fermer les recours':'Examiner les recours'}</button>
  {open&&<><h3 className="text-lg font-semibold">Recours en attente</h3>{error&&<p role="alert" className="text-red-200">{error}</p>}{busy&&<p role="status">Chargement…</p>}
   {!busy&&!items.length&&!error&&<p className="text-sm text-zinc-400">Aucun recours en attente.</p>}
   <ul className="space-y-3">{items.map(item=><li key={item.id} className="rounded-lg border border-zinc-800 p-3"><p className="font-medium">{item.username?'@'+item.username:'Compte supprimé'}{item.game_title?' — '+item.game_title:''} · {new Date(item.created_at).toLocaleString('fr-FR')}</p><p className="my-2 whitespace-pre-wrap break-words text-sm">{item.description}</p>{item.subject&&<Link className="text-sm text-cyan-200 underline" href={'/admin/moderation?subject='+item.subject}>Consulter la cible et son historique</Link>}<button disabled={busy} className={socialButton} onClick={()=>{setSelected(item);setDecision('');setState('rejected');setLift(false)}}>Réexaminer le recours</button></li>)}</ul>
   <div className="flex flex-wrap gap-3"><button disabled={busy} className={socialButton} onClick={()=>{setCursor(null);setRevision(value=>value+1);setSelected(null)}}>Recharger les recours récents</button><button disabled={busy||items.length!==20} className={socialButton} onClick={()=>{const last=items.at(-1);if(last)setCursor({before:last.created_at,cursor:last.id});setSelected(null)}}>Recours suivants</button></div>
   {selected&&<form onSubmit={submit} className="space-y-4 border-t border-zinc-800 pt-5"><h4 className="font-semibold">Décider du recours de {selected.username?'@'+selected.username:'ce compte'}</h4><p className="whitespace-pre-wrap break-words text-sm text-zinc-400">Motif initial : {selected.reason}</p><label className="block">Issue du recours<select disabled={busy} className={field} value={state} onChange={event=>{setState(event.target.value);setLift(false)}}><option value="rejected">Rejeter le recours</option><option value="accepted">Accepter le recours</option></select></label><label className="block">Justification du réexamen<textarea disabled={busy} required minLength={10} maxLength={5000} className={field} value={decision} onChange={event=>setDecision(event.target.value)}/></label>{state==='accepted'&&(selected.user_id||selected.game_id)&&<label className="flex gap-3"><input disabled={busy} type="checkbox" checked={lift} onChange={event=>setLift(event.target.checked)}/>{selected.kind==='game'?'Restaurer explicitement la publication du jeu':'Lever explicitement la restriction actuellement active'}</label>}<button disabled={busy} className={socialButton}>Confirmer le réexamen</button></form>}
  </>}
 </section>
}

'use client'
import {useEffect,useRef,useState} from 'react'
import {fetchJson} from '@/lib/asyncOperation'
import {socialButton} from '@/lib/social'
import type {AppealDetail} from '@/lib/moderationAdmin'
import {field} from './ModerationMeasures'

export default function ModerationAppeals({token,item,onSaved}:{token:string;item:AppealDetail;onSaved:()=>void}){
 const [decision,setDecision]=useState(''),[state,setState]=useState('rejected'),[lift,setLift]=useState(false),[withdraw,setWithdraw]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false)
 const locked=useRef(false),attempt=useRef<string|null>(null),alive=useRef(true)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 async function submit(event:React.FormEvent){
  event.preventDefault();if(locked.current)return
  if(!window.confirm((state==='accepted'?'Accepter':'Rejeter')+' ce recours ? '+(withdraw?'L’avertissement sera retiré, sans lever une autre restriction.':lift?'La restriction actuellement active sera explicitement levée.':'Aucune sanction ne sera levée automatiquement.')+' La justification sera communiquée.'))return
  locked.current=true;setBusy(true);setError('')
  const body=JSON.stringify({id:item.id,version:item.version,state,decision,lift,effect:withdraw?'withdraw_warning':lift?'lift_current':'none',subjectVersion:item.measure.current_version,operationId:crypto.randomUUID()})
  if(attempt.current){setError('Recharge le recours avant une nouvelle décision.');locked.current=false;setBusy(false);return}
  attempt.current=body;setNeedsRefresh(true)
  try{const {response,payload}=await fetchJson('/api/admin/moderation/appeals',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body});if(!response.ok)throw Error(payload.error??'Réexamen non confirmé.');if(alive.current)onSaved()}
  catch(cause){if(alive.current)setError((cause instanceof Error?cause.message:'Réexamen non confirmé.')+' Recharge le recours avant de réessayer.')}
  finally{if(alive.current){locked.current=false;setBusy(false)}}
 }
 return <form onSubmit={submit} className="space-y-5 rounded-xl border border-cyan-900 bg-cyan-950/10 p-4 sm:p-6"><h3 className="text-lg font-semibold">Décider du recours</h3>
  <p className="text-sm leading-6 text-zinc-300">Accepter clôt les faits contestés, mais ne retire pas automatiquement l’avertissement ni ne lève une restriction. Choisis explicitement son effet.</p>
  {error&&<p role="alert" className="text-red-200">{error}</p>}
  <label className="block">Issue du recours<select disabled={busy} className={field} value={state} onChange={event=>{setState(event.target.value);setLift(false);setWithdraw(false)}}><option value="rejected">Rejeter le recours</option><option value="accepted">Accepter le recours</option></select></label>
  <label className="block">Justification du réexamen<textarea disabled={busy} required minLength={10} maxLength={5000} className={field+' min-h-32'} value={decision} onChange={event=>setDecision(event.target.value)}/></label>
  {state==='accepted'&&item.measure.action==='warn'&&!item.measure.withdrawal&&<label className="flex items-start gap-3"><input disabled={busy} type="checkbox" checked={withdraw} onChange={event=>{setWithdraw(event.target.checked);setLift(false)}}/>Retirer explicitement l’avertissement contesté, sans lever d’autre restriction</label>}
  {state==='accepted'&&item.measure.action!=='warn'&&item.measure.target&&item.measure.blocked&&<label className="flex items-start gap-3"><input disabled={busy} type="checkbox" checked={lift} onChange={event=>setLift(event.target.checked)}/>{item.measure.kind==='game'?'Restaurer explicitement la publication du jeu':'Lever explicitement la restriction actuellement active'}</label>}
  <div className="flex flex-wrap gap-3"><button disabled={busy||needsRefresh} className={socialButton}>Confirmer le réexamen</button><button disabled={busy} type="button" className={socialButton} onClick={onSaved}>Recharger le recours</button></div>
 </form>
}

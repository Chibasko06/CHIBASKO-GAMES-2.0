'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {developerJson,SubmissionError} from '@/lib/game-distribution/browser-upload'
import {developerDate} from '@/lib/developerPresentation'
import type {DeveloperEmailStatus} from '@/lib/server/developerEmail'

const explanations:Record<string,string>={rate_limited:'La limite de demandes est atteinte. Attendez avant de renvoyer un code.',verification_invalid:'Ce code est incorrect ou n’est plus utilisable.',verification_expired:'Le code a expiré. Demandez-en un nouveau.',verification_locked:'Les cinq essais ont été utilisés. Demandez un nouveau code après le délai autorisé.',email_revision_changed:'L’adresse a changé. Rechargez son état avant de demander un code.',email_delivery_in_progress:'Un envoi est déjà engagé. Attendez sa fin avant de recommencer.',verification_unavailable:'La vérification est temporairement indisponible. Votre historique reste accessible.'}
export default function DeveloperEmailVerification({token,canVerify,onVerified}:{token:string;canVerify:boolean;onVerified:(verified:boolean)=>void}){
 const [status,setStatus]=useState<DeveloperEmailStatus|null>(null),[enabled,setEnabled]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[code,setCode]=useState(''),[notice,setNotice]=useState(''),[clock,setClock]=useState(Date.now),[retryAt,setRetryAt]=useState(0)
 const request=useRef<string|null>(null),locked=useRef(false),alive=useRef(true),epoch=useRef(0)
 const accept=useCallback((data:DeveloperEmailStatus)=>{setStatus(data);setRetryAt(Date.now()+(data.retryAfter??0)*1000);onVerified(data.verified)},[onVerified])
 const refresh=useCallback(async()=>{const version=++epoch.current;try{const body=await developerJson('/api/developer/profile/email',token);if(alive.current&&version===epoch.current){accept(body.data);setEnabled(body.enabled===true)}}catch{if(alive.current&&version===epoch.current){setError('Impossible de vérifier l’état de l’adresse. Réessayez.');onVerified(false)}}},[token,accept,onVerified])
 useEffect(()=>{alive.current=true;void Promise.resolve().then(()=>{if(alive.current)return refresh()});const timer=setInterval(()=>setClock(Date.now()),1000);return()=>{alive.current=false;clearInterval(timer)}},[refresh])
 useEffect(()=>{if(!status?.challenge||status.challenge.acceptedByProvider||status.verified)return;const timer=setInterval(()=>{void refresh()},5000);return()=>clearInterval(timer)},[status?.challenge,status?.verified,refresh])
 const wait=Math.max(0,Math.ceil((retryAt-clock)/1000)),expired=!!status?.challenge&&Date.parse(status.challenge.expiresAt)<=clock
 async function act(action:'send'|'confirm'){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('')
  try{
   const body=action==='send'?{action,requestId:request.current??=crypto.randomUUID()}:{action,challengeId:status?.challenge?.id,code}
   const result=await developerJson('/api/developer/profile/email',token,{method:'POST',body:JSON.stringify(body)})
   if(!alive.current)return;accept(result.data)
   if(action==='send'){request.current=null;setCode('');setNotice('Code demandé. Son envoi est traité par la file de notifications ; sa réception n’est pas encore confirmée.')}
   else {setCode('');setNotice('Votre adresse professionnelle est vérifiée.');window.dispatchEvent(new Event('chibasko:developer-email'))}
  }catch(cause){if(alive.current){setError(cause instanceof SubmissionError?explanations[cause.code]??'La demande n’a pas pu être confirmée. Vérifiez son état avant de réessayer.':'Le service est temporairement indisponible.');await refresh()}}
  finally{locked.current=false;if(alive.current)setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border border-cyan-900 bg-black/30 p-4" aria-label="Vérification de l’adresse professionnelle"><h3 className="font-semibold">Vérification de l’adresse professionnelle</h3>
 {!canVerify?<p className="text-sm text-amber-200">Enregistrez d’abord les coordonnées de la fiche pour vérifier cette adresse.</p>:status?.verified?<p role="status" className="text-sm text-emerald-300">Adresse professionnelle vérifiée{status.verifiedAt?' le '+developerDate(status.verifiedAt):''}. Elle est distincte de votre adresse de connexion.</p>:<>
 <p className="text-sm text-zinc-300">Un code de six chiffres, valable dix minutes, confirme que vous avez accès à cette boîte. Cinq essais sont autorisés. Vos anciens dépôts restent consultables.</p>
 {!enabled&&status&&<p role="status" className="text-sm text-amber-200">La vérification est temporairement indisponible. Aucun nouveau dépôt ne peut être effectué sans adresse vérifiée.</p>}
 <button type="button" className="min-h-11 rounded-lg border border-cyan-600 px-4 py-2 text-sm text-cyan-200 disabled:opacity-50" disabled={busy||!enabled||wait>0} onClick={()=>void act('send')}>{wait?`Renvoyer dans ${wait} s`:status?.challenge?'Renvoyer un code':'Recevoir un code de vérification'}</button>
 {status?.challenge&&<><p className="text-sm text-zinc-400">{expired?'Code expiré.':'Expiration : '+developerDate(status.challenge.expiresAt,true)} · {status.challenge.attemptsRemaining} essai(s) restant(s). {status.challenge.acceptedByProvider?'Message accepté par le fournisseur ; vérifiez aussi les indésirables.':'En attente d’un acquittement du fournisseur.'}</p>
 <form className="flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();void act('confirm')}}><label className="min-w-0 text-sm">Code à six chiffres<input className="mt-1 block w-44 max-w-full rounded-lg border border-zinc-600 bg-zinc-900 p-3 tracking-[.3em]" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required disabled={busy||expired||!enabled}/></label><button className="min-h-11 rounded-lg bg-cyan-300 px-4 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-50" disabled={busy||code.length!==6||expired||!enabled}>Confirmer mon adresse</button></form></>}
 </>}
 <button type="button" className="block min-h-10 text-sm text-cyan-200 underline" disabled={busy} onClick={()=>void refresh()}>Vérifier l’état de l’adresse</button>
 {notice&&<p role="status" className="text-sm text-emerald-200">{notice}</p>}{error&&<p role="alert" className="text-sm text-red-200">{error}</p>}
 </section>
}

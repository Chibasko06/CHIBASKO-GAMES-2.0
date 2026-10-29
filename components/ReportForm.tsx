'use client'
import {useEffect,useRef,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {reportCategories,type ReportKind} from '@/lib/moderation'
import {fetchJson} from '@/lib/asyncOperation'
import {socialButton} from '@/lib/social'

type Challenge={render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void;reset:(id:string)=>void}
declare global {interface Window{turnstile?:Challenge}}
export default function ReportForm({kind,target='',editable=false,siteKey}:{kind:ReportKind;target?:string;editable?:boolean;siteKey?:string}){
 const {user,session,loading}=useAuth()
 const [locator,setLocator]=useState(target),[category,setCategory]=useState('other'),[description,setDescription]=useState(''),[name,setName]=useState(''),[email,setEmail]=useState('')
 const [faith,setFaith]=useState(false),[sensitive,setSensitive]=useState(false),[website,setWebsite]=useState(''),[botToken,setBotToken]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[receipt,setReceipt]=useState<number|null>(null),[uncertain,setUncertain]=useState(false),[botError,setBotError]=useState(false),[challengeRevision,setChallengeRevision]=useState(0)
 const active=useRef(true),lock=useRef(false),operation=useRef<string|null>(null),challenge=useRef<HTMLDivElement>(null),widget=useRef<string|null>(null)
 const needsContact=!user||category==='illegal'
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 useEffect(()=>{
  if(user||loading||!siteKey||receipt!==null)return
  let cancelled=false
  const failed=()=>{if(!cancelled){setBotToken('');setBotError(true)}}
  const mount=()=>{if(cancelled||!challenge.current||!window.turnstile||widget.current!==null)return;widget.current=window.turnstile.render(challenge.current,{sitekey:siteKey,action:'moderation',callback:(value:string)=>{if(!cancelled){setBotToken(value);setBotError(false)}},'expired-callback':failed,'error-callback':failed})}
  let script=document.querySelector<HTMLScriptElement>('script[data-moderation-challenge]')
  if(!script){script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.dataset.moderationChallenge='1';document.head.appendChild(script)}
  script.addEventListener('load',mount);script.addEventListener('error',failed);mount()
  return()=>{cancelled=true;script?.removeEventListener('load',mount);script?.removeEventListener('error',failed);if(widget.current!==null){window.turnstile?.remove(widget.current);widget.current=null}}
 },[user,loading,siteKey,challengeRevision,receipt])
 async function submit(event:React.FormEvent){
  event.preventDefault();if(lock.current||receipt!==null)return
  lock.current=true;setBusy(true);setError('');operation.current??=crypto.randomUUID()
  try{
   const {response,payload}=await fetchJson('/api/reports',{method:'POST',headers:{'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify({operationId:operation.current,kind,target:locator,category,description,contactName:name,contactEmail:email,goodFaith:faith,sensitiveException:sensitive&&category==='illegal',website,botToken})})
   if(!active.current)return
   if(!response.ok){setUncertain(response.status>=500||response.status===409);setError(typeof payload.error==='string'?payload.error:'Signalement non confirmé.');return}
   const value=payload.data as {number?:unknown}|undefined
   if(!value||!Number.isSafeInteger(value.number))throw Error('Réception non confirmée. Réessaie avec les mêmes informations.')
   setReceipt(value.number as number);setUncertain(false)
  }catch(cause){if(active.current){setError(cause instanceof Error?cause.message:'Réception non confirmée. Réessaie avec les mêmes informations.');setUncertain(true)}}
  finally{lock.current=false;if(active.current)setBusy(false)}
 }
 if(receipt!==null)return <div role="status" className="rounded-xl border border-cyan-800 p-5"><h3 className="font-semibold">Signalement reçu — dossier #{receipt}</h3><p className="mt-2 text-sm text-zinc-300">L’équipe Chibasko Games examinera ce dossier. Aucun retrait ou sanction n’est automatique.</p>{category==='illegal'&&email&&<p className="mt-2 text-sm">Un accusé de réception et la décision seront adressés aux coordonnées indiquées.</p>}</div>
 return <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
  <p className="text-sm text-zinc-400">Décris les faits et leur emplacement exact. N’envoie aucune pièce d’identité, image sensible, mot de passe ou donnée personnelle inutile.</p>
  <fieldset disabled={busy||uncertain} className="space-y-4 disabled:opacity-70">
   {editable?<label className="block text-sm">{kind==='player'?'Joueur : @pseudo, identifiant ou URL':'Jeu : identifiant, slug ou URL'}<input required value={locator} maxLength={500} onChange={event=>setLocator(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black p-3"/></label>:<p className="break-all text-xs text-zinc-500">Cible : {locator}</p>}
   <label className="block text-sm">Motif<select aria-label="Motif" value={category} onChange={event=>{setCategory(event.target.value);setSensitive(false)}} className="mt-1 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black p-3">{Object.entries(reportCategories[kind]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label className="block text-sm">Description et emplacement précis<textarea required minLength={20} maxLength={5000} value={description} onChange={event=>setDescription(event.target.value)} className="mt-1 block min-h-36 w-full rounded-lg border border-zinc-700 bg-black p-3"/></label>
   {category==='illegal'&&<><label className="flex items-start gap-3 text-sm"><input type="checkbox" required checked={faith} onChange={event=>setFaith(event.target.checked)} className="mt-1"/>Je crois de bonne foi que les informations de ce signalement sont exactes et complètes.</label><label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={sensitive} onChange={event=>{setSensitive(event.target.checked);if(event.target.checked){setName('');setEmail('')}}} className="mt-1"/>Signalement relatif à des abus ou à l’exploitation sexuels de mineurs : je souhaite utiliser l’exception permettant de ne pas fournir mes coordonnées.</label></>}
   {needsContact&&!sensitive&&<div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Nom ou dénomination<input required minLength={2} maxLength={160} autoComplete="name" value={name} onChange={event=>setName(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black p-3"/></label><label className="text-sm">E-mail de contact<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={event=>setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black p-3"/></label></div>}
   <div hidden aria-hidden="true"><label>Site web<input tabIndex={-1} autoComplete="off" value={website} onChange={event=>setWebsite(event.target.value)}/></label></div>
  </fieldset>
  {!user&&<><div ref={challenge}/>{(!siteKey||botError)&&<p role="status" className="text-sm text-amber-200">Vérification invité indisponible. Contact direct : <a href="mailto:chibasko06@gmail.com" className="underline">chibasko06@gmail.com</a>.</p>}{botError&&<button type="button" className={socialButton} onClick={()=>{if(!window.turnstile)document.querySelector('script[data-moderation-challenge]')?.remove();setChallengeRevision(value=>value+1)}}>Relancer la vérification</button>}</>}
  {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
  <button type="submit" disabled={busy||loading||(!user&&!botToken)} className={socialButton}>{busy?'Enregistrement…':uncertain?'Vérifier la même demande':'Envoyer le signalement'}</button>
  {uncertain&&<><p className="text-xs text-amber-200">La première demande peut avoir été reçue. Vérifie-la avant de créer un signalement différent.</p><button type="button" className={socialButton+' ml-2'} onClick={()=>{setUncertain(false);operation.current=null;setError('')}}>Modifier la demande</button></>}
  <p className="text-xs text-zinc-500">Le dossier est privé et conservé pour son examen. <a href="/confidentialite" className="underline">Confidentialité</a> · Pour un recours, indique le numéro du dossier via le <a href="/contact" className="underline">contact</a>.</p>
 </form>
}

'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useAuth} from './AuthProvider'
import {supabase} from '@/lib/supabaseClient'
import {fetchJson} from '@/lib/asyncOperation'
import {moderationMeasureNames as labels} from '@/lib/moderation'
import {socialButton} from '@/lib/social'

type Measure={archived_at?:string|null;id:string;action:string;reason:string;ends_at:string|null;created_at:string;game_title?:string|null;appeal:{state:string;decision:string|null}|null}
type Status={blocked:boolean;measure?:string;endsAt?:string|null;current?:Measure|null;history:Measure[]}
export default function AccountModeration(){
 const {session,loading}=useAuth(),token=session?.access_token
 const [cursor,setCursor]=useState<{before:string;cursor:string}|null>(null)
 const [data,setData]=useState<Status|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[selected,setSelected]=useState(''),[description,setDescription]=useState('')
 const epoch=useRef(0),locked=useRef(false),attempt=useRef<{id:string;measure:string;description:string}|null>(null)
 const invalidate=useCallback(()=>{epoch.current++},[])
 useEffect(()=>{if(!token)return;let active=true;const version=++epoch.current;locked.current=true
  void Promise.resolve().then(async()=>{if(!active)return;setBusy(true);setError('');const {response,payload}=await fetchJson('/api/account/moderation?'+new URLSearchParams(cursor??{}),{headers:{Authorization:'Bearer '+token}});if(!response.ok)throw Error(payload.error??'Décisions indisponibles.');if(active&&version===epoch.current)setData(payload.data)})
   .catch(cause=>{if(active&&version===epoch.current)setError(cause instanceof Error?cause.message:'Chargement impossible.')}).finally(()=>{if(active&&version===epoch.current){locked.current=false;setBusy(false)}})
  return()=>{active=false;invalidate()}
 },[token,revision,cursor,invalidate])
 async function appeal(event:React.FormEvent){
  event.preventDefault();if(locked.current||!token||!selected)return
  if(attempt.current&&(attempt.current.measure!==selected||attempt.current.description!==description)){setError('Une demande reste non confirmée. Actualise avant de modifier le recours.');return}
  attempt.current??={id:crypto.randomUUID(),measure:selected,description};locked.current=true;setBusy(true);setError('');const version=epoch.current
  try{const {response,payload}=await fetchJson('/api/account/moderation',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({operationId:attempt.current.id,measureId:selected,description})});if(!response.ok)throw Error(payload.error??'Réception non confirmée.');if(version===epoch.current){attempt.current=null;setSelected('');setDescription('');setRevision(value=>value+1)}}
  catch(cause){if(version===epoch.current)setError(cause instanceof Error?cause.message:'Réception non confirmée.')}
  finally{if(version===epoch.current){locked.current=false;setBusy(false)}}
 }
 return <main className="mx-auto max-w-3xl space-y-6 px-4 py-8"><h1 className="text-3xl font-bold">Décisions et recours</h1><p className="text-sm leading-6 text-zinc-400">Cet espace reste accessible pendant une restriction de ton compte Chibasko Games. Il présente les motifs communicables et permet un réexamen.</p>
  {!loading&&!session?<Link href="/login?next=%2Faccount%2Fmoderation" className={socialButton}>Se connecter</Link>:<>
   {error&&<p role="alert" className="text-red-200">{error}</p>}{(loading||busy)&&<p role="status">Chargement…</p>}
   {data&&<p className="rounded-xl border border-cyan-900 p-4">{data.blocked?'Ton compte fait actuellement l’objet d’une restriction.':'Aucune restriction active sur ton compte.'}{data.endsAt&&data.blocked?' Fin prévue : '+new Date(data.endsAt).toLocaleString('fr-FR'):''}</p>}
   {data?.current&&<section className="space-y-3 rounded-xl border border-rose-900 p-4"><h2 className="font-semibold">Motif de la restriction active</h2><p className="whitespace-pre-wrap break-words text-sm">{data.current.reason}</p>{!data.current.appeal&&<button disabled={busy} className={socialButton} onClick={()=>{setSelected(data.current!.id);setDescription('')}}>Contester la restriction active</button>}</section>}
   <ul className="space-y-4">{data?.history.map(item=><li key={item.id} className="space-y-3 rounded-xl border border-zinc-800 p-4"><h2 className="font-semibold">{labels[item.action]??'Décision administrative'}{item.game_title?' — '+item.game_title:''} · {new Date(item.created_at).toLocaleString('fr-FR')}</h2><p className="whitespace-pre-wrap break-words text-sm">{item.reason}</p>{item.ends_at&&<p className="text-xs text-zinc-400">Échéance : {new Date(item.ends_at).toLocaleString('fr-FR')}</p>}{item.appeal?<div className="text-sm text-cyan-100"><p>Recours {item.appeal.state==='pending'?'en cours d’examen':item.appeal.state==='accepted'?'accepté':'rejeté'}.</p>{item.appeal.decision&&<p className="mt-2 whitespace-pre-wrap break-words">{item.appeal.decision}</p>}</div>:!item.archived_at&&!['lift','restore'].includes(item.action)&&<button disabled={busy} className={socialButton} onClick={()=>{setSelected(item.id);setDescription('')}}>Contester cette décision</button>}</li>)}</ul>
   {data&&!data.history.length&&<p>Aucune décision enregistrée.</p>}
   <nav aria-label="Historique des décisions" className="flex flex-wrap gap-3"><button disabled={busy||!cursor} className={socialButton} onClick={()=>setCursor(null)}>Décisions récentes</button><button disabled={busy||data?.history.length!==20} className={socialButton} onClick={()=>{const last=data?.history.at(-1);if(last)setCursor({before:last.created_at,cursor:last.id})}}>Décisions antérieures</button></nav>
   {selected&&<form onSubmit={appeal} className="space-y-4 rounded-xl border border-cyan-900 p-4"><label className="block">Motif de ton recours<textarea disabled={busy} required minLength={20} maxLength={5000} value={description} onChange={event=>setDescription(event.target.value)} className="mt-2 min-h-32 w-full rounded-lg border border-zinc-700 bg-black p-3"/></label><p className="text-xs text-zinc-400">Un recours par décision. Décris les faits utiles, sans données personnelles inutiles. Aucun rétablissement automatique.</p><button disabled={busy} className={socialButton}>Envoyer le recours</button></form>}
   <div className="flex flex-wrap gap-3"><button disabled={busy} className={socialButton} onClick={()=>{attempt.current=null;setRevision(value=>value+1)}}>Actualiser les décisions</button><button className={socialButton} onClick={()=>void supabase.auth.signOut()}>Se déconnecter</button><Link href="/contact" className={socialButton}>Contacter Chibasko Games</Link></div>
  </>}
 </main>
}

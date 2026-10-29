'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/components/AuthProvider'
import {useAdminAccess} from '@/components/admin/useAdminAccess'
import AdminShell from '@/components/admin/AdminShell'
import {moderationStates,type ModerationCase,type ModerationState} from '@/lib/moderation'
import {fetchJson} from '@/lib/asyncOperation'
import {socialButton} from '@/lib/social'

export default function Moderation(){
 const {session}=useAuth(),access=useAdminAccess()
 if(access.status==='checking')return <p role="status">Vérification des accès…</p>
 if(access.status!=='allowed'||!session)return <div role="alert">Accès administrateur requis. <button className={socialButton} onClick={access.retry}>Réessayer</button></div>
 return <Console key={session.access_token} token={session.access_token}/>
}
function Console({token}:{token:string}){
 const [items,setItems]=useState<ModerationCase[]>([]),[hasMore,setHasMore]=useState(false),[page,setPage]=useState(1),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[state,setState]=useState(''),[kind,setKind]=useState('')
 const [detail,setDetail]=useState<ModerationCase|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const [decision,setDecision]=useState<ModerationState>('review'),[justification,setJustification]=useState(''),[note,setNote]=useState(''),[reviewed,setReviewed]=useState(false),[redact,setRedact]=useState(false),[redactNotes,setRedactNotes]=useState(false),[redactedDescription,setRedactedDescription]=useState('')
 const alive=useRef(true),epoch=useRef(0),locked=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const call=useCallback(async(query:string,body?:unknown)=>{
  const {response,payload}=await fetchJson('/api/admin/moderation?'+query,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if(!response.ok)throw Error(typeof payload.error==='string'?payload.error:'La modération est indisponible.')
  return payload.data
 },[token])
 useEffect(()=>{
  let cancelled=false;const version=++epoch.current;locked.current=true
  void Promise.resolve().then(()=>{if(!cancelled)setBusy(true);return call(new URLSearchParams({page:String(page),search:query,state,kind}).toString())})
   .then(result=>{if(!cancelled&&alive.current&&version===epoch.current){const value=result as {items:ModerationCase[];hasMore:boolean};if(!Array.isArray(value.items)||typeof value.hasMore!=='boolean')throw Error('Réponse invalide.');setItems(value.items);setHasMore(value.hasMore);setError('')}})
   .catch(cause=>{if(!cancelled&&alive.current&&version===epoch.current){setItems([]);setHasMore(false);setError(cause instanceof Error?cause.message:'Impossible de charger les dossiers.')}})
   .finally(()=>{if(!cancelled&&alive.current&&version===epoch.current){locked.current=false;setBusy(false)}})
  return()=>{cancelled=true}
 },[page,query,state,kind,revision,call])
 async function open(id:string){
  if(locked.current)return
  locked.current=true;setBusy(true);setError('');const version=++epoch.current
  try{const value=await call('id='+encodeURIComponent(id)) as ModerationCase;if(alive.current&&version===epoch.current){setDetail(value);setDecision('review');setJustification('');setNote('');setReviewed(false);setRedact(false);setRedactNotes(false);setRedactedDescription(value.description)}}
  catch(cause){if(alive.current&&version===epoch.current)setError(cause instanceof Error?cause.message:'Dossier indisponible.')}
  finally{if(alive.current&&version===epoch.current){locked.current=false;setBusy(false)}}
 }
 async function save(event:React.FormEvent){
  event.preventDefault();if(locked.current||!detail)return
  if(!window.confirm('Enregistrer cette décision dans l’historique du dossier ? Aucune sanction ne sera appliquée.'))return
  locked.current=true;setBusy(true);setError('');const version=++epoch.current
  try{const value=await call('',{action:'update',id:detail.id,version:detail.version,state:decision,justification,note,privacyReviewed:reviewed,redactNotes,...(redact?{redactedDescription}:{})}) as ModerationCase;if(alive.current&&version===epoch.current){setDetail(value);setNote('');setJustification('');setRedact(false);setRedactNotes(false);setRedactedDescription(value.description)}}
  catch(cause){if(alive.current&&version===epoch.current)setError((cause instanceof Error?cause.message:'Décision non confirmée.')+' Recharge le dossier avant toute nouvelle tentative.')}
  finally{if(alive.current&&version===epoch.current){locked.current=false;setBusy(false)}}
 }
 return <AdminShell active="moderation"><div aria-busy={busy} className="space-y-5">
  <p className="text-sm text-zinc-400">Signalements privés. Les décisions de suivi n’appliquent aucune sanction ni dépublication.</p>
  {error&&<p role="alert" className="text-red-300">{error}</p>}{busy&&<p role="status">Chargement…</p>}
  {detail?<section className="space-y-5 rounded-xl border border-zinc-800 p-4 sm:p-6">
   <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-bold">Dossier #{detail.number}</h2><button disabled={busy} className={socialButton} onClick={()=>{setDetail(null);setRevision(value=>value+1)}}>Retour aux dossiers</button><button disabled={busy} className={socialButton} onClick={()=>void open(detail.id)}>Recharger le dossier</button></div>
   <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Identifiant</dt><dd className="break-all">{detail.id}</dd></div><div><dt className="text-zinc-500">Statut</dt><dd>{moderationStates[detail.state]}</dd></div><div><dt className="text-zinc-500">Auteur</dt><dd>{detail.reporter?<Link className="break-all text-cyan-200 underline" href={'/players/'+detail.reporter}>{detail.reporter_name?'@'+detail.reporter_name:detail.reporter}</Link>:'Invité ou compte supprimé'}</dd></div><div><dt className="text-zinc-500">Cible</dt><dd>{detail.target_user||detail.target_game?<Link href={detail.target_locator} className="break-all text-cyan-200 underline">{detail.target_kind==='player'?'Joueur':'Jeu'} — {detail.target_locator}</Link>:'Cible supprimée'}</dd></div><div><dt className="text-zinc-500">Motif</dt><dd>{detail.category}</dd></div><div><dt className="text-zinc-500">Coordonnées privées</dt><dd>{detail.contact_name??'Non renseignées'} {detail.contact_email&&<a className="break-all text-cyan-200 underline" href={'mailto:'+encodeURIComponent(detail.contact_email)}>{detail.contact_email}</a>}</dd></div></dl>
   <p className="whitespace-pre-wrap break-words rounded-lg bg-black p-4 text-sm">{detail.description}</p>
   {detail.target_view&&<section className="rounded border border-zinc-800 p-4"><h3 className="font-semibold">État actuel de la cible</h3><p className="mt-2 break-words text-sm">{detail.target_view.username?'@'+detail.target_view.username:detail.target_view.title}</p>{detail.target_view.bio&&<p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-300">{detail.target_view.bio}</p>}{detail.target_view.published===false&&<p className="mt-2 text-sm text-amber-200">Ce jeu n’est plus publié.</p>}</section>}
   {detail.privacy_review&&<p role="status" className="text-sm text-amber-200">Compte supprimé : vérifier et minimiser les données personnelles encore nécessaires dans les textes.</p>}
   <form onSubmit={save} className="space-y-3"><label className="block text-sm">Décision de suivi<select disabled={busy} value={decision} onChange={event=>setDecision(event.target.value as ModerationState)} className="mt-1 block min-h-11 w-full rounded border border-zinc-700 bg-black p-3">{(['review','dismissed','resolved'] as const).map(value=><option key={value} value={value}>{moderationStates[value]}</option>)}</select></label><label className="block text-sm">Justification communicable<textarea disabled={busy} required={decision!=='review'} minLength={decision==='review'?0:10} maxLength={5000} value={justification} onChange={event=>setJustification(event.target.value)} className="mt-1 min-h-24 w-full rounded border border-zinc-700 bg-black p-3"/></label><label className="block text-sm">Note administrative privée<textarea disabled={busy} required={redact||redactNotes} minLength={redact||redactNotes?10:0} maxLength={5000} value={note} onChange={event=>setNote(event.target.value)} className="mt-1 min-h-24 w-full rounded border border-zinc-700 bg-black p-3"/></label><details className="rounded border border-zinc-800 p-3 text-sm"><summary className="cursor-pointer py-2">Minimiser les données du dossier</summary><p className="my-2 text-zinc-400">Une correction est historisée sans conserver le texte personnel retiré. Explique le motif dans la note administrative. Les e-mails déjà reçus ne peuvent pas être rappelés.</p><label className="flex gap-3 py-2"><input type="checkbox" checked={redact} onChange={event=>setRedact(event.target.checked)}/>Remplacer la description pour retirer des données inutiles</label>{redact&&<label className="block">Description minimisée<textarea disabled={busy} required minLength={20} maxLength={5000} value={redactedDescription} onChange={event=>setRedactedDescription(event.target.value)} className="mt-1 min-h-24 w-full rounded border border-zinc-700 bg-black p-3"/></label>}<label className="flex gap-3 py-2"><input type="checkbox" checked={redactNotes} onChange={event=>setRedactNotes(event.target.checked)}/>Retirer les anciens textes des notes et justifications, en conservant les dates, statuts et références de décision</label></details>{detail.privacy_review&&<label className="flex gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Les données personnelles nécessaires à l’examen ont été revues.</label>}<button disabled={busy} className={socialButton}>Enregistrer la décision</button></form>
   <h3 className="font-semibold">Historique</h3><ol className="space-y-3">{detail.events?.map(item=><li key={item.id} className="rounded border border-zinc-800 p-3 text-sm"><p>{moderationStates[item.state]} · {new Date(item.created_at).toLocaleString('fr-FR')} · {item.actor??item.actor_reference??'Compte supprimé'}</p>{item.justification&&<p className="mt-2 whitespace-pre-wrap break-words">{item.justification}</p>}{item.note&&<p className="mt-2 whitespace-pre-wrap break-words text-amber-200">Note privée : {item.note}</p>}</li>)}</ol>
   <h3 className="font-semibold">Notifications</h3><ul className="space-y-1 text-sm">{detail.mail?.map(item=><li key={item.id}>{item.kind} : {item.state} — {item.attempts} tentative(s)</li>)}</ul>
  </section>:<>
   <form onSubmit={event=>{event.preventDefault();setPage(1);setQuery(search);setRevision(value=>value+1)}} className="flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-sm">Rechercher un dossier<input value={search} maxLength={100} onChange={event=>setSearch(event.target.value)} placeholder="Numéro, identifiant ou mots du signalement" className="mt-1 block min-h-11 w-full rounded border border-zinc-700 bg-black p-3"/></label><label className="text-sm">Statut<select value={state} onChange={event=>{setState(event.target.value);setPage(1)}} className="mt-1 block min-h-11 rounded border border-zinc-700 bg-black p-3"><option value="">Tous</option>{Object.entries(moderationStates).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm">Cible<select value={kind} onChange={event=>{setKind(event.target.value);setPage(1)}} className="mt-1 block min-h-11 rounded border border-zinc-700 bg-black p-3"><option value="">Toutes</option><option value="player">Joueur</option><option value="game">Jeu</option></select></label><button disabled={busy} className={socialButton}>Rechercher</button></form>
   {!busy&&!items.length&&!error&&<p className="rounded border border-dashed border-zinc-700 p-5 text-zinc-400">Aucun dossier correspondant.</p>}
   <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">{items.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="font-semibold">#{item.number} · {item.target_kind==='player'?'Joueur':'Jeu'} · {item.category}</p><p className="mt-1 text-sm text-zinc-400">{moderationStates[item.state]} · {new Date(item.created_at).toLocaleDateString('fr-FR')} · {item.reporter_name?'@'+item.reporter_name:item.reporter?'Compte connecté':'Invité ou compte supprimé'}</p>{item.privacy_review&&<p className="text-xs text-amber-200">Revue des données personnelles</p>}</div><button disabled={busy} className={socialButton} onClick={()=>void open(item.id)}>Examiner le dossier #{item.number}</button></li>)}</ul>
   <div className="flex flex-wrap items-center gap-3"><button disabled={busy||page===1} className={socialButton} onClick={()=>setPage(value=>value-1)}>Précédent</button><span className="text-sm">Page {page}</span><button disabled={busy||!hasMore} className={socialButton} onClick={()=>setPage(value=>value+1)}>Suivant</button></div>
  </>}
 </div></AdminShell>
}

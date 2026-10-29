'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useAuth} from '@/components/AuthProvider'
import {useAdminAccess} from '@/components/admin/useAdminAccess'
import AdminShell from '@/components/admin/AdminShell'
import {moderationStates,reportCategories,type ModerationCase,type ModerationState} from '@/lib/moderation'
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
 const alive=useRef(true),epoch=useRef(0),locked=useRef(false),linkedCase=useRef<string|null>(typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('id'))
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const call=useCallback(async(query:string,body?:unknown)=>{
  const {response,payload}=await fetchJson('/api/admin/moderation?'+query,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
  if(!response.ok)throw Error(typeof payload.error==='string'?payload.error:'La modération est indisponible.')
  return payload.data
 },[token])
 useEffect(()=>{
  let cancelled=false;const version=++epoch.current;locked.current=true
  void Promise.resolve().then(()=>{if(cancelled)return null;setBusy(true);const id=linkedCase.current;linkedCase.current=null;return id&&/^[a-f0-9-]{36}$/i.test(id)?call('id='+encodeURIComponent(id)):call(new URLSearchParams({page:String(page),search:query,state,kind}).toString())})
   .then(result=>{if(!cancelled&&alive.current&&version===epoch.current){if(result&&typeof result==='object'&&'id' in result){const dossier=result as ModerationCase;setDetail(dossier);setRedactedDescription(dossier.description);setDecision(dossier.state==='open'?'review':dossier.state);return}const value=result as {items:ModerationCase[];hasMore:boolean};if(!Array.isArray(value.items)||typeof value.hasMore!=='boolean')throw Error('Réponse invalide.');setItems(value.items);setHasMore(value.hasMore);setError('')}})
   .catch(cause=>{if(!cancelled&&alive.current&&version===epoch.current){setItems([]);setHasMore(false);setError(cause instanceof Error?cause.message:'Impossible de charger les dossiers.')}})
   .finally(()=>{if(!cancelled&&alive.current&&version===epoch.current){locked.current=false;setBusy(false)}})
  return()=>{cancelled=true}
 },[page,query,state,kind,revision,call])
 async function open(id:string,preserveDraft=false){
  if(locked.current)return
  locked.current=true;setBusy(true);setError('');const version=++epoch.current
  try{const value=await call('id='+encodeURIComponent(id)) as ModerationCase;if(alive.current&&version===epoch.current){setDetail(value);if(!preserveDraft){setDecision(value.state==='open'?'review':value.state);setJustification('');setNote('');setReviewed(false);setRedact(false);setRedactNotes(false);setRedactedDescription(value.description)}}}
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
 return <AdminShell active="moderation"><div aria-busy={busy} className="space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-zinc-400">Examine les faits, puis consigne une décision. Aucune sanction ni dépublication n’est automatique.</p>{busy&&<p role="status" className="text-sm text-cyan-200">Chargement…</p>}</div>
  {error&&<p role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</p>}
  {detail?<>
   <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 bg-cyan-950/20 p-5"><div><p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-300">Signalement {detail.target_kind==='player'?'de joueur':'de jeu'}</p><h2 className="text-2xl font-bold">Dossier #{detail.number}</h2><p className="mt-2 text-sm text-zinc-400">Reçu le {date(detail.created_at)}</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} className={socialButton} onClick={()=>{setDetail(null);setRevision(value=>value+1)}}>Retour aux dossiers</button><button disabled={busy} className={socialButton} onClick={()=>void open(detail.id)}>Recharger le dossier</button></div></header>
    <div className="space-y-6 p-4 sm:p-6">
     <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Field title="Signalé par"><p className="break-words font-semibold">{detail.reporter?<Link className="text-cyan-200 underline" href={'/players/'+detail.reporter}>{detail.reporter_name?'@'+detail.reporter_name:'Compte connecté'}</Link>:detail.contact_name||'Invité ou compte supprimé'}</p></Field>
      <Field title={detail.target_kind==='player'?'Joueur signalé':'Jeu signalé'}>{detail.target_user||detail.target_game?<Link href={detail.target_locator} className="break-words font-semibold text-cyan-200 underline">{targetName(detail)}</Link>:<span>Cible supprimée</span>}</Field>
      <Field title="Statut actuel"><Status state={detail.state}/></Field>
      <Field title="Motif du signalement"><span className="font-medium">{reason(detail)}</span></Field>
      <Field title="Contact privé du déclarant">{detail.contact_email?<a className="break-all text-cyan-200 underline" href={'mailto:'+encodeURIComponent(detail.contact_email)}>{detail.contact_email}</a>:<span className="text-zinc-400">Non renseigné</span>}</Field>
     </dl>
     <section><h3 className="mb-3 font-semibold">Description du signalement</h3><p className="whitespace-pre-wrap break-words rounded-xl border border-zinc-800 bg-black/40 p-4 text-sm leading-7 text-zinc-200">{detail.description}</p></section>
     {detail.target_view&&<section className="rounded-lg border border-zinc-800 p-4 text-sm"><h3 className="font-semibold">État actuel de la cible</h3>{detail.target_view.bio&&<p className="mt-2 whitespace-pre-wrap break-words text-zinc-400">{detail.target_view.bio}</p>}{detail.target_view.published===false&&<p className="mt-2 text-amber-200">Ce jeu n’est plus publié.</p>}</section>}
     <details className="text-sm text-zinc-400"><summary className="cursor-pointer py-2 focus-visible:outline-cyan-400">Références techniques</summary><dl className="mt-2 space-y-2 break-all"><div><dt>Dossier</dt><dd>{detail.id}</dd></div><div><dt>Auteur</dt><dd>{detail.reporter??'Aucun compte associé'}</dd></div><div><dt>Cible</dt><dd>{detail.target_user??detail.target_game??'Supprimée'}</dd></div><div><dt>Version</dt><dd>{detail.version}</dd></div></dl></details>
    </div>
   </section>
   <form onSubmit={save} className="space-y-5 rounded-2xl border border-cyan-900/60 bg-cyan-950/10 p-4 sm:p-6">
    <div><h3 className="text-lg font-semibold">Décider du suivi</h3><p className="mt-1 text-sm text-zinc-400">Cette décision concerne le dossier de signalement, pas les droits du compte ou la publication du jeu.</p></div>
    {detail.privacy_review&&<p role="status" className="rounded-lg border border-amber-900 bg-amber-950/20 p-3 text-sm text-amber-200">Compte supprimé : vérifier et minimiser les données personnelles encore nécessaires dans les textes.</p>}
    <label className="block text-sm font-medium">Décision de suivi<select aria-describedby="decision-help" disabled={busy} value={decision} onChange={event=>setDecision(event.target.value as ModerationState)} className={inputClass}>{(['review','dismissed','resolved'] as const).map(value=><option key={value} value={value}>{moderationStates[value]}</option>)}</select></label>
    <p id="decision-help" className="rounded-lg bg-black/30 p-3 text-sm leading-6 text-cyan-100">{decisionHelp[decision]}</p>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-cyan-900/50 p-4"><label className="block text-sm font-semibold">Justification communicable<textarea aria-describedby="public-help" disabled={busy} required={decision!=='review'} minLength={decision==='review'?0:10} maxLength={5000} value={justification} onChange={event=>setJustification(event.target.value)} className={inputClass+' min-h-32'}/></label><p id="public-help" className="mt-2 text-xs leading-5 text-zinc-400">Explique les faits examinés et la conclusion. Ce texte peut être communiqué au déclarant ; une clôture d’un signalement de contenu potentiellement illicite avec contact déclenche un e-mail. Ne pas y inclure de note confidentielle.</p></section>
    <section className="rounded-xl border border-amber-900/40 p-4"><label className="block text-sm font-semibold text-amber-100">Note administrative privée<textarea aria-describedby="private-help" disabled={busy} required={redact||redactNotes} minLength={redact||redactNotes?10:0} maxLength={5000} value={note} onChange={event=>setNote(event.target.value)} className={inputClass+' min-h-32'}/></label><p id="private-help" className="mt-2 text-xs leading-5 text-zinc-400">Réservée aux administrateurs. Facultative, sauf lors d’une minimisation des textes. Jamais incluse dans l’e-mail de décision.</p></section></div>
    <details className="rounded-lg border border-zinc-800 p-3 text-sm"><summary className="cursor-pointer py-2">Minimiser les données du dossier</summary><p className="my-2 leading-6 text-zinc-400">Une correction est historisée sans conserver le texte personnel retiré. Explique le motif dans la note administrative. Les e-mails déjà reçus ne peuvent pas être rappelés.</p><label className="flex items-start gap-3 py-2"><input disabled={busy} type="checkbox" checked={redact} onChange={event=>setRedact(event.target.checked)}/>Remplacer la description pour retirer des données inutiles</label>{redact&&<label className="block">Description minimisée<textarea disabled={busy} required minLength={20} maxLength={5000} value={redactedDescription} onChange={event=>setRedactedDescription(event.target.value)} className={inputClass+' min-h-24'}/></label>}<label className="flex items-start gap-3 py-2"><input disabled={busy} type="checkbox" checked={redactNotes} onChange={event=>setRedactNotes(event.target.checked)}/>Retirer les anciens textes des notes et justifications, en conservant les dates, statuts et références de décision</label></details>
    {detail.privacy_review&&<label className="flex items-start gap-3 text-sm"><input disabled={busy} type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Les données personnelles nécessaires à l’examen ont été revues.</label>}
    <button disabled={busy} className={socialButton}>Enregistrer la décision</button>
   </form>
   <section className="rounded-2xl border border-zinc-800 p-4 sm:p-6"><h3 className="mb-4 text-lg font-semibold">Historique du dossier</h3><ol className="space-y-3">{detail.events?.map(item=><li key={item.id} className="rounded-lg border border-zinc-800 p-4 text-sm"><div className="flex flex-wrap items-center gap-3"><Status state={item.state}/><span className="text-zinc-400">{date(item.created_at)}</span></div>{item.justification&&<p className="mt-3 whitespace-pre-wrap break-words"><span className="block text-xs text-zinc-500">Justification communicable</span>{item.justification}</p>}{item.note&&<p className="mt-3 whitespace-pre-wrap break-words text-amber-200">Note privée : {item.note}</p>}<details className="mt-3 text-xs text-zinc-500"><summary className="cursor-pointer py-2">Référence de l’intervenant</summary><p className="break-all">{item.actor??item.actor_reference??'Compte supprimé'}</p></details></li>)}</ol></section>
   <section className="rounded-2xl border border-zinc-800 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Suivi des e-mails</h3><button disabled={busy} type="button" className={socialButton} onClick={()=>void open(detail.id,true)}>Actualiser les envois</button></div><p className="mt-3 text-sm leading-6 text-zinc-400">État enregistré lors du dernier chargement. La maintenance passe toutes les cinq minutes. Un e-mail reçu peut rester en attente de confirmation si l’accusé technique n’a pas été enregistré ; ne pas le renvoyer manuellement.</p><ul className="mt-4 space-y-3">{detail.mail?.map(item=><li key={item.id} className="flex flex-wrap justify-between gap-3 rounded-lg bg-black/30 p-3 text-sm"><span>{mailKind[item.kind]??'Notification'}</span><span>{mailState[item.state]??'État inconnu'} · {item.attempts} tentative(s)</span></li>)}</ul></section>
  </>:<>
   <form onSubmit={event=>{event.preventDefault();setPage(1);setQuery(search);setRevision(value=>value+1)}} className="grid gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]"><label className="min-w-0 text-sm">Rechercher un dossier<input value={search} maxLength={100} onChange={event=>setSearch(event.target.value)} placeholder="Numéro ou mots du signalement" className={inputClass}/></label><label className="text-sm">Statut<select value={state} onChange={event=>{setState(event.target.value);setPage(1)}} className={inputClass}><option value="">Tous</option>{Object.entries(moderationStates).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm">Cible<select value={kind} onChange={event=>{setKind(event.target.value);setPage(1)}} className={inputClass}><option value="">Toutes</option><option value="player">Joueur</option><option value="game">Jeu</option></select></label><button disabled={busy} className={socialButton+' self-end'}>Rechercher</button></form>
   {!busy&&!items.length&&!error&&<p className="rounded-xl border border-dashed border-zinc-700 p-8 text-center text-zinc-400">Aucun dossier correspondant.</p>}
   <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">{items.map(item=><li key={item.id} className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 p-4 sm:p-5"><div className="min-w-0 flex-1 basis-56"><div className="mb-2 flex flex-wrap items-center gap-3"><span className="text-xs font-semibold text-zinc-400">DOSSIER #{item.number}</span><Status state={item.state}/></div><h3 className="break-words font-semibold">{targetName(item)}</h3><p className="mt-1 text-sm text-cyan-200">{reason(item)}</p><p className="mt-2 text-xs text-zinc-400">Signalé par {item.reporter_name?'@'+item.reporter_name:item.reporter?'un compte connecté':'un invité ou compte supprimé'} · {date(item.created_at)}</p>{item.privacy_review&&<p className="mt-2 text-xs text-amber-200">Revue des données personnelles nécessaire</p>}</div><button disabled={busy} className={socialButton} onClick={()=>void open(item.id)}>Examiner le dossier #{item.number}</button></li>)}</ul>
   <nav aria-label="Pagination des signalements" className="flex flex-wrap items-center justify-center gap-3"><button disabled={busy||page===1} className={socialButton} onClick={()=>setPage(value=>value-1)}>Précédent</button><span className="text-sm text-zinc-400">Page {page}</span><button disabled={busy||!hasMore} className={socialButton} onClick={()=>setPage(value=>value+1)}>Suivant</button></nav>
  </>}
 </div></AdminShell>
}
const inputClass='mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black/50 p-3 font-normal text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-400'
const decisionHelp:Record<ModerationState,string>={open:'Le dossier attend un examen.',review:'Le dossier reste ouvert pour vérifier les faits ou recueillir des éléments complémentaires.',dismissed:'Clôture sans suite donnée au signalement. Une justification est obligatoire. Aucune sanction n’est appliquée.',resolved:'Clôture après traitement du signalement. Décris le résultat de l’examen ; ce statut ne prouve ni sanction ni retrait du contenu.'}
const mailKind:Record<string,string>={admin:'Alerte administrative',receipt:'Accusé de réception',decision:'Décision au déclarant'}
const mailState:Record<string,string>={pending:'En attente d’envoi ou de confirmation',sent:'Accepté par le service d’envoi',attention_required:'Vérification manuelle nécessaire'}
function date(value:string){return new Date(value).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})}
function reason(item:ModerationCase){return (reportCategories[item.target_kind] as Record<string,string>)[item.category]??'Autre'}
function targetName(item:ModerationCase){return item.target_view?.username?'@'+item.target_view.username:item.target_view?.title??(item.target_kind==='player'?'Joueur signalé':'Jeu signalé')}
function Status({state}:{state:ModerationState}){return <span className={'inline-flex rounded-full border px-2.5 py-1 text-xs font-medium '+(state==='open'?'border-amber-800 bg-amber-950/40 text-amber-200':state==='review'?'border-cyan-800 bg-cyan-950/40 text-cyan-200':'border-zinc-700 bg-zinc-900 text-zinc-300')}>{moderationStates[state]}</span>}
function Field({title,children}:{title:string;children:React.ReactNode}){return <div className="min-w-0"><dt className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</dt><dd className="text-sm">{children}</dd></div>}

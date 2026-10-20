'use client'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {httpLaunchClient} from '@/lib/game-runtime/client'
import {technicalError,type AdminBuild} from '@/lib/game-distribution/review'
import {ADMIN_REVIEW_LABELS,checklistComplete,reviewDate,reviewPresentation} from '@/lib/game-distribution/admin-review-presentation'
import {FormFeedback,HelpText} from '@/components/ui/FormFeedback'
import {ReviewBadge,ReviewCard,reviewButton,reviewPrimary} from './ReviewPrimitives'
import LegacySubmissions from './LegacySubmissions'
const GameRuntime=dynamic(()=>import('@/components/game-runtime/GameRuntime'),{ssr:false})
export default function BuildReviews({id}:{id?:string}){
 const {session}=useAuth()
 return <Panel key={(session?.user.id??'anonymous')+':'+(id??'list')} id={id} token={session?.access_token}/>
}
function Panel({id,token}:{id?:string;token?:string}){
 const [rows,setRows]=useState<AdminBuild[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
 const [reload,setReload]=useState(0),[offset,setOffset]=useState(0),[filter,setFilter]=useState('Tous')
 const [checks,setChecks]=useState<Record<string,boolean>>({}),[reason,setReason]=useState(''),[submission,setSubmission]=useState(''),[decision,setDecision]=useState<'reject'|'archive'|null>(null)
 const [preview,setPreview]=useState<'local'|'online'|null>(null),[onlineSession,setOnlineSession]=useState('')
 const client=useMemo(()=>httpLaunchClient(async()=>token??null),[token])
 useEffect(()=>{
  const controller=new AbortController()
  if(!token)return()=>controller.abort()
  fetch(id?'/api/admin/game-builds/'+encodeURIComponent(id):'/api/admin/game-builds?offset='+offset,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal})
   .then(async r=>{if(!r.ok)throw Error('load');return r.json()})
   .then(body=>{if(!controller.signal.aborted){const values=id?[body.data]:body.data;setRows(values);setError('');setLoading(false);setChecks(id?values[0].review.checklist:{});setSubmission(id?(values[0].review.submissionId??''):'')}})
   .catch(()=>{if(!controller.signal.aborted){setRows([]);setLoading(false);setError('Soumission introuvable ou accès indisponible.')}})
  return()=>controller.abort()
 },[id,token,reload,offset])
 async function action(action:string){
  if(!token||!id)return
  setBusy(true);setError('');setNotice('')
  try{
   const response=await fetch('/api/admin/game-builds/'+encodeURIComponent(id),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,...(action==='review'?{checklist:checks}:{}),...(['reject','archive'].includes(action)?{reason}:{}),...(action==='link_submission'?{submissionId:submission||null}:{})})})
   if(!response.ok)throw Error('action')
   const {data}=await response.json();setRows([data]);setChecks(data.review.checklist);setSubmission(data.review.submissionId??'');setPreview(null);setDecision(null);setReason('')
   setNotice(action==='review'?'Revue enregistrée.':action==='publish'?'Cette version a été publiée.':action==='reject'?'Soumission refusée.':action==='archive'?'Version archivée.':'Association mise à jour.')
  }catch{setError('Action refusée. Vérifiez le statut, la revue et le motif, puis actualisez.')}finally{setBusy(false)}
 }
 const build=id?rows[0]:null,presentation=build?reviewPresentation(build,checks):null
 const capabilities=build?.manifest?.capabilities as {local?:unknown;online?:unknown}|undefined
 const field='mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-zinc-100 focus:border-cyan-400'
 return <main className="mx-auto max-w-6xl space-y-6 p-4 text-zinc-100 sm:p-6">
  <nav aria-label="Administration" className="flex flex-wrap gap-4 text-sm text-cyan-300"><Link href="/admin">Administration</Link><Link href="/admin/game-builds">Publications de jeux</Link></nav>
  <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">{build?(build.submission?.title||build.game):id?'Soumission de jeu':'Publications de jeux'}</h1>{build?<p className="mt-2 text-zinc-400">Version {build.version} · {build.submission?.developer||build.developer||'Développeur non renseigné'}</p>:<HelpText>Vérifier, tester et décider de la publication de chaque version.</HelpText>}{build?.developer&&<HelpText>Soumis par : {build.developer}</HelpText>}</div><button type="button" className={reviewButton} disabled={busy} onClick={()=>{setPreview(null);setReload(n=>n+1)}}>Actualiser</button></div>
  {error&&<FormFeedback tone="error" title="Opération impossible"><p>{error}</p></FormFeedback>}
  {notice&&<FormFeedback tone="success" title={notice}/>}
  {loading&&<p role="status">Chargement des soumissions…</p>}
  {!id&&<>
   <label className="block text-sm">Statut sur cette page<select className={field+' max-w-sm'} value={filter} onChange={e=>setFilter(e.target.value)}>{['Tous','À vérifier','Vérification technique réussie','À tester','Revue à compléter','Prêt à publier','Publié','Refusé','Archivé'].map(s=><option key={s}>{s}</option>)}</select></label>
   <ul className="grid gap-4 md:grid-cols-2">{rows.filter(r=>filter==='Tous'||reviewPresentation(r).label===filter).map(r=>{const status=reviewPresentation(r);return <li className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-5" key={r.id}><div className="mb-3"><ReviewBadge tone={status.tone}>{status.label}</ReviewBadge></div><h2 className="text-xl font-semibold"><Link className="text-cyan-200 underline decoration-cyan-900 underline-offset-4" href={'/admin/game-builds/'+r.id}>{r.submission?.title||r.game}</Link></h2><p className="mt-2 text-sm text-zinc-300">Version {r.version} · {r.developer||'Développeur non renseigné'}</p><HelpText>{reviewDate(r.createdAt)} · ZIP {(r.archiveSize/1024**2).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mio</HelpText></li>})}</ul>
   {!loading&&!error&&!rows.filter(r=>filter==='Tous'||reviewPresentation(r).label===filter).length&&<HelpText>Aucune soumission dans cette sélection.</HelpText>}
   <div className="flex gap-3"><button className={reviewButton} disabled={!offset||busy} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Précédent</button><button className={reviewButton} disabled={rows.length<50||busy} onClick={()=>setOffset(n=>n+50)}>Suivant</button></div>
   <LegacySubmissions token={token}/>
  </>}
  {build&&presentation&&<>
   <div className="space-y-3 rounded-2xl border border-cyan-900 bg-cyan-950/20 p-5"><div role="status"><ReviewBadge tone={presentation.tone}>{presentation.label}</ReviewBadge></div><p className="font-medium">{presentation.next}</p>{build.review.reason&&<FormFeedback tone="warning" title="Motif de la décision"><p className="whitespace-pre-wrap">{build.review.reason}</p></FormFeedback>}</div>
   <ReviewCard title="Informations proposées">
    {build.submission?.kind==='update'?<FormFeedback tone="info" title="Mise à jour du jeu"><p>Cette soumission remplace uniquement le build. Les informations du catalogue restent inchangées.</p></FormFeedback>:<>
    <div className="grid gap-6 md:grid-cols-[1fr_18rem]"><dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[['Titre',build.submission?.title||build.game],['Développeur / studio',build.submission?.developer||build.developer],['Date de sortie',build.submission?.releaseDate],['Compatible mobile',build.submission?.mobile],['Technologie',build.submission?.technology],['Catégories',build.submission?.categories?.join(', ')]].map(([label,value])=><div key={label}><dt className="text-sm text-zinc-400">{label}</dt><dd className="mt-1 break-words font-medium">{value||'Non renseigné'}</dd></div>)}</dl>{build.submission?.cover&&<figure><Image src={build.submission.cover} alt={'Couverture proposée pour '+(build.submission.title||build.game)} width={640} height={360} unoptimized className="h-auto w-full rounded-xl border border-zinc-700 object-contain"/><figcaption className="mt-2 text-sm text-zinc-400">Couverture proposée</figcaption></figure>}</div>
    <div><h3 className="mb-2 text-sm text-zinc-400">Description</h3><p className="whitespace-pre-wrap break-words leading-7">{build.submission?.description||build.description||'Non renseignée'}</p></div>
    {!build.submission&&<FormFeedback tone="warning" title="Informations éditoriales non associées"><p>Vérifiez leur présence avant la revue. Une ancienne proposition peut être associée dans les détails techniques.</p></FormFeedback>}
    </>}
    <HelpText>Les informations approuvées sont appliquées lors de la publication. La visibilité dans le catalogue reste gérée depuis la fiche du jeu.</HelpText>
   </ReviewCard>
   <div className="grid items-start gap-6 lg:grid-cols-2">
    <ReviewCard title="1. Vérification technique"><ReviewBadge tone={presentation.technical==='Réussie'?'success':presentation.technical==='Échec'?'error':'warning'}>{presentation.technical}</ReviewBadge><p className="text-sm leading-6 text-zinc-300">Cette étape vérifie automatiquement le ZIP, le manifeste et les fichiers du jeu.</p>{build.errorCode&&<FormFeedback tone="error" title="Vérification non aboutie"><p>{technicalError(build.errorCode)}</p></FormFeedback>}
     <details className="rounded-xl border border-zinc-700 p-4"><summary className="cursor-pointer font-medium text-cyan-200">Voir les instructions de vérification</summary><div className="mt-3 space-y-3"><p className="text-sm">Cette vérification doit actuellement être lancée depuis le poste d’administration.</p><HelpText>Actualisez ce dossier après son exécution.</HelpText><details><summary className="cursor-pointer text-sm text-cyan-300">Mode avancé / Instructions techniques</summary><pre className="mt-3 overflow-auto rounded-lg bg-black p-3 text-xs">npm run review:game -- {build.id}</pre><HelpText>Le validator récupère le ZIP privé et vérifie ses fichiers sans exécuter le jeu. Le dispatcher automatique reste désactivé.</HelpText></details></div></details>
    </ReviewCard>
    <ReviewCard title="2. Tester le jeu">
     {!presentation.canTest?<FormFeedback tone="info" title={build.technicalStatus!=='completed'?'Non disponible tant que la vérification technique n’est pas terminée':'Test indisponible pour cette version'}><p>{presentation.terminal?'Le statut de cette version ne permet pas de nouveau test.':'Le jeu de test sera accessible après validation.'}</p></FormFeedback>:<>
      <HelpText>Le test s’ouvre dans un espace isolé. Les cases de revue ne remplacent pas cette protection.</HelpText>
      {capabilities?.local?<button type="button" className={reviewPrimary} disabled={busy} onClick={()=>setPreview('local')}>Lancer le jeu de test</button>:null}
      {capabilities?.online?<details open={!capabilities.local} className="rounded-xl border border-zinc-700 p-4"><summary className="cursor-pointer font-medium">Test multijoueur</summary><label className="mt-3 block text-sm">Session de test multijoueur<input className={field} value={onlineSession} onChange={e=>{setPreview(null);setOnlineSession(e.target.value)}}/></label><HelpText>Utilisez une session multijoueur déjà préparée.</HelpText><button type="button" className={reviewButton+' mt-3'} disabled={busy||!onlineSession.trim()} onClick={()=>setPreview('online')}>{capabilities.local?'Lancer le test multijoueur':'Lancer le jeu de test'}</button></details>:null}
     </>}
    </ReviewCard>
   </div>
   {preview&&build.gameVersionId&&<ReviewCard title="Jeu de test"><GameRuntime key={build.gameVersionId+preview} gameId={build.gameId} gameVersionId={build.gameVersionId} execution={preview} audience={build.versionStatus==='published'?'published':'preview'} locale="fr" onlineSessionReference={preview==='online'?onlineSession:undefined} client={client} onLeave={()=>setPreview(null)}/><button type="button" className={reviewButton} onClick={()=>setPreview(null)}>Fermer le test</button></ReviewCard>}
   <ReviewCard title="3. Revue"><div role="status"><ReviewBadge tone={checklistComplete(checks)?'success':'warning'}>{checklistComplete(checks)?'Revue complète':'Revue incomplète'}</ReviewBadge></div><fieldset disabled={busy||!presentation.canReview} className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">Contrôles de revue</legend>{Object.entries(ADMIN_REVIEW_LABELS).map(([key,label])=><label className="flex min-h-14 items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/50 p-4" key={key}><input type="checkbox" className="size-5 shrink-0 accent-cyan-400" checked={checks[key]===true} onChange={e=>setChecks(previous=>({...previous,[key]:e.target.checked}))}/><span>{label}</span></label>)}</fieldset><div className="flex flex-wrap items-center gap-3"><button type="button" className={reviewButton} disabled={busy||!presentation.canReview||!checklistComplete(checks)} onClick={()=>action('review')}>Enregistrer la revue</button><HelpText>{build.review.reviewedAt?'Revue enregistrée le '+reviewDate(build.review.reviewedAt):'La revue doit être enregistrée avant publication.'}</HelpText></div></ReviewCard>
   <ReviewCard title="4. Décision"><div className="flex flex-wrap gap-3"><button type="button" className={reviewPrimary} disabled={busy||!presentation.canPublish} onClick={()=>action('publish')}>{busy?'Traitement…':'Publier'}</button><button type="button" className={reviewButton+' border-rose-800 text-rose-200'} disabled={busy||!presentation.canReject} onClick={()=>setDecision('reject')}>Refuser</button><button type="button" className={reviewButton} disabled={busy||!presentation.canArchive} onClick={()=>setDecision('archive')}>Archiver</button></div>{!presentation.terminal&&!presentation.canPublish&&<HelpText>La publication nécessite une vérification technique réussie et une revue complète enregistrée.</HelpText>}
    {decision&&<div className="space-y-3 rounded-xl border border-rose-900 bg-rose-950/20 p-4"><label className="block text-sm font-medium" htmlFor="decision-reason">Motif {decision==='reject'?'du refus':'de l’archivage'} — visible au développeur<textarea id="decision-reason" className={field} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>{decision==='archive'&&<HelpText>L’archivage retire la version du jeu actif si nécessaire, sans supprimer immédiatement ses fichiers.</HelpText>}<div className="flex flex-wrap gap-3"><button type="button" className={reviewButton+' border-rose-700'} disabled={busy||!reason.trim()} onClick={()=>action(decision)}>Confirmer {decision==='reject'?'le refus':'l’archivage'}</button><button type="button" className={reviewButton} disabled={busy} onClick={()=>{setDecision(null);setReason('')}}>Annuler</button></div></div>}
   </ReviewCard>
   <details className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5"><summary className="cursor-pointer font-semibold text-zinc-300">Détails techniques</summary><div className="mt-5 space-y-5 text-sm"><dl className="grid gap-3 sm:grid-cols-2">{[['Upload UUID',build.id],['gameId',build.gameId],['versionId',build.gameVersionId??'Non créée'],['Statut brut',build.technicalStatus],['Statut version',build.versionStatus??'Non créée'],['Décision enregistrée',build.review.decision],['Tentatives',String(build.attempts)],['Taille ZIP',build.archiveSize.toLocaleString('fr-FR')+' octets'],['Soumission',reviewDate(build.createdAt)],['Mise à jour',reviewDate(build.updatedAt)],['Validation',reviewDate(build.validatedAt)],['Publication',reviewDate(build.publishedAt)]].map(([label,value])=><div key={label}><dt className="text-zinc-400">{label}</dt><dd className="break-all">{value}</dd></div>)}</dl><div><h3 className="font-medium">Commande de validation</h3><pre className="mt-2 overflow-auto rounded-lg bg-black p-3 text-xs">npm run review:game -- {build.id}</pre></div>{build.manifest&&<details><summary className="cursor-pointer text-cyan-300">Manifeste validé</summary><pre className="mt-2 overflow-auto text-xs">{JSON.stringify(build.manifest,null,2)}</pre></details>}<details><summary className="cursor-pointer text-cyan-300">Association d’une ancienne proposition</summary><label className="mt-3 block">Identifiant de proposition<input className={field} value={submission} onChange={e=>setSubmission(e.target.value)}/></label><button type="button" className={reviewButton+' mt-3'} disabled={busy} onClick={()=>action('link_submission')}>Associer / retirer</button></details><div><h3 className="font-medium">Historique détaillé</h3>{build.history.length?<ul className="mt-2 space-y-2">{build.history.map((event,i)=><li key={i}>{reviewDate(event.at)} — {event.action}</li>)}</ul>:<HelpText>Aucun événement de revue.</HelpText>}</div><HelpText>Les tests utilisent l’Artifact Gateway et le GameRuntime existants.</HelpText></div></details>
  </>}
 </main>
}

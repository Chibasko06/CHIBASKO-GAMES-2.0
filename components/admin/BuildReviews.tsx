'use client'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {useEffect,useMemo,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {httpLaunchClient} from '@/lib/game-runtime/client'
import {buildLabel,REVIEW_CHECKLIST,technicalError,type AdminBuild} from '@/lib/game-distribution/review'
const GameRuntime=dynamic(()=>import('@/components/game-runtime/GameRuntime'),{ssr:false})

export default function BuildReviews({id}:{id?:string}) {
  const {session}=useAuth()
  return <Panel key={session?.user.id??'anonymous'} id={id} token={session?.access_token}/>
}
function Panel({id,token}:{id?:string;token?:string}) {
  const [rows,setRows]=useState<AdminBuild[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [reload,setReload]=useState(0),[offset,setOffset]=useState(0),[filter,setFilter]=useState('Tous')
  const [checks,setChecks]=useState<Record<string,boolean>>({}),[reason,setReason]=useState(''),[submission,setSubmission]=useState('')
  const [preview,setPreview]=useState<'local'|'online'|null>(null),[onlineSession,setOnlineSession]=useState('')
  const client=useMemo(()=>httpLaunchClient(async()=>token??null),[token])
  useEffect(()=>{
    const controller=new AbortController()
    if(!token)return()=>controller.abort()
    fetch(id?'/api/admin/game-builds/'+encodeURIComponent(id):'/api/admin/game-builds?offset='+offset,
      {headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error('load');return r.json()})
      .then(body=>{if(!controller.signal.aborted){const values=id?[body.data]:body.data;setRows(values);setError('');setChecks(id?values[0].review.checklist:{});setSubmission(id?(values[0].review.submissionId??''):'')}})
      .catch(()=>{if(!controller.signal.aborted){setRows([]);setError('Build introuvable ou accès indisponible.')}})
    return()=>controller.abort()
  },[id,token,reload,offset])
  async function action(action:string) {
    if(!token||!id)return
    setBusy(true);setError('')
    try {
      const response=await fetch('/api/admin/game-builds/'+encodeURIComponent(id),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({action,...(action==='review'?{checklist:checks}:{}),...(['reject','archive'].includes(action)?{reason}:{}),...(action==='link_submission'?{submissionId:submission||null}:{})})})
      if(!response.ok)throw Error('action')
      const body=await response.json();setRows([body.data]);setPreview(null)
    }catch{setError('Action refusée. Vérifier le statut, la checklist et le motif, puis actualiser.')}finally{setBusy(false)}
  }
  const build=id?rows[0]:null
  const capabilities=build?.manifest?.capabilities as {local?:unknown;online?:unknown}|undefined
  const button='rounded border border-zinc-600 px-3 py-2 disabled:opacity-40'
  return <main className="mx-auto max-w-6xl space-y-6 p-6 text-zinc-100">
    <nav className="flex gap-4"><Link href="/admin">Administration</Link><Link href="/admin/game-builds">Builds de jeux</Link></nav>
    <h1 className="text-2xl font-bold">{id?'Revue du build':'Builds de jeux'}</h1>
    <p>Validation technique locale, puis revue humaine et publication explicite. Le dispatcher automatique reste désactivé.</p>
    <button className={button} onClick={()=>setReload(n=>n+1)}>Actualiser</button>
    {error&&<p role="alert">{error}</p>}
    {!id&&<>
      <label>Statut sur cette page <select className="bg-zinc-900 p-2" value={filter} onChange={e=>setFilter(e.target.value)}>{['Tous','Reçu','En attente de vérification','Vérification en cours','Vérification technique réussie','Refusé','Publié','Archivé'].map(s=><option key={s}>{s}</option>)}</select></label>
      <ul className="space-y-3">{rows.filter(r=>filter==='Tous'||buildLabel(r)===filter).map(r=><li className="border border-zinc-700 p-4" key={r.id}>
        <Link className="underline" href={'/admin/game-builds/'+r.id}>{r.game} — {r.version}</Link>
        <p>{r.developer||'Développeur non renseigné'} · {r.createdAt} · {r.archiveSize.toLocaleString()} octets</p>
        <p>{buildLabel(r)} · {r.gameVersionId??'Aucune game_version'}</p>{r.errorCode&&<p>{technicalError(r.errorCode)}</p>}
      </li>)}</ul>
      {!rows.length&&!error&&<p>Aucun build chargé.</p>}
      <div className="flex gap-3"><button className={button} disabled={!offset} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Précédent</button><button className={button} disabled={rows.length<50} onClick={()=>setOffset(n=>n+50)}>Suivant</button></div>
    </>}
    {build&&<>
      <section className="space-y-2"><h2 className="text-xl">{build.game} — {build.version}</h2><p>{build.developer||'Développeur non renseigné'}</p><p>{build.description}</p>
        <p>Upload : {build.id} · ZIP : {build.archiveSize.toLocaleString()} octets</p><p>Soumis : {build.createdAt} · Mis à jour : {build.updatedAt}</p>
        <p>{buildLabel(build)} · Validation : {build.technicalStatus} · Tentatives : {build.attempts}</p>
        <p>Version : {build.gameVersionId??'Non créée'} · {build.versionStatus} {build.active?'(active)':''}</p>
        <p>{technicalError(build.errorCode)} {build.review.reason}</p>
      </section>
      <section className="space-y-2"><h2 className="text-xl">Proposition catalogue associée</h2>
        {build.submission?<div><p>{build.submission.title} — {build.submission.developer} — {build.submission.status}<br/>{build.submission.description}</p>
          {build.submission.kind==='new'&&<><p>Sortie : {build.submission.releaseDate} · Mobile : {build.submission.mobile} · Technologie : {build.submission.technology}</p><p>Catégories : {build.submission.categories?.join(', ')}</p>{build.submission.cover&&<a href={build.submission.cover} target="_blank" rel="noopener noreferrer">Voir la couverture proposée</a>}<p>Les métadonnées proposées seront appliquées lors de la publication explicite de cette version. La visibilité catalogue reste gérée dans l’administration du jeu.</p></>}
          {build.submission.kind==='update'&&<p>Mise à jour du build uniquement. La fiche catalogue reste inchangée.</p>}
        </div>:<p>Aucune proposition reliée. Les propositions et les uploads sont des dossiers distincts ; aucun rapprochement par nom ou email.</p>}
        <label>Identifiant de proposition <input className="bg-zinc-900 p-2" value={submission} onChange={e=>setSubmission(e.target.value)}/></label>
        <button className={button} disabled={busy} onClick={()=>action('link_submission')}>Associer / retirer</button>
      </section>
      <section className="space-y-2"><h2 className="text-xl">1. Préparer et valider localement</h2>
        <p>Sur le poste de revue configuré avec les credentials serveur, exécuter :</p><pre className="overflow-auto">npm run review:game -- {build.id}</pre>
        <p>La commande récupère le ZIP privé et utilise le validator sécurisé. Aucun téléchargement direct ni exécution du ZIP sur le poste. Actualiser après son résultat.</p>
      </section>
      {build.manifest&&<details><summary>Manifeste validé</summary><pre className="overflow-auto">{JSON.stringify(build.manifest,null,2)}</pre></details>}
      <section className="space-y-3"><h2 className="text-xl">2. Tester dans le runtime isolé</h2>
        <p>La checklist ne remplace pas la sandbox. Les tests passent par le Gateway et le GameRuntime existants.</p>
        {build.gameVersionId&&['draft','in_review','approved','published'].includes(build.versionStatus??'')&&<>
          <button className={button} disabled={!capabilities?.local} onClick={()=>setPreview('local')}>Tester le mode local</button>
          <label>Référence de session online préparée <input className="bg-zinc-900 p-2" value={onlineSession} onChange={e=>setOnlineSession(e.target.value)}/></label>
          <button className={button} disabled={!onlineSession||!capabilities?.online} onClick={()=>setPreview('online')}>Tester le mode online</button>
        </>}
        {preview&&build.gameVersionId&&<GameRuntime key={build.gameVersionId+preview} gameId={build.gameId} gameVersionId={build.gameVersionId} execution={preview} audience={build.versionStatus==='published'?'published':'preview'} locale="fr" onlineSessionReference={preview==='online'?onlineSession:undefined} client={client} onLeave={()=>setPreview(null)}/>}
      </section>
      <section className="space-y-3"><h2 className="text-xl">3. Revue humaine et décision</h2>
        {Object.entries(REVIEW_CHECKLIST).map(([key,label])=><label className="block" key={key}><input type="checkbox" checked={checks[key]===true} onChange={e=>setChecks({...checks,[key]:e.target.checked})}/> {label}</label>)}
        <p>Revue effectuée : {build.review.reviewedAt??'Non'}</p>
        <div className="flex gap-3"><button className={button} disabled={busy||build.technicalStatus!=='completed'} onClick={()=>action('review')}>Enregistrer la revue effectuée</button>
          <button className={button} disabled={busy||build.review.decision!=='reviewed'} onClick={()=>action('publish')}>Accepter et publier cette version</button></div>
        <label className="block">Motif de refus / archivage (visible au développeur)<textarea className="block w-full bg-zinc-900 p-2" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
        <div className="flex gap-3"><button className={button} disabled={busy||!reason.trim()} onClick={()=>action('reject')}>Refuser</button><button className={button} disabled={busy||!reason.trim()} onClick={()=>action('archive')}>Archiver (retirer du runtime si active)</button></div>
      </section>
      <section><h2 className="text-xl">Historique de revue</h2><p>Validation technique : {build.validatedAt??'En attente'} · Publication : {build.publishedAt??'Non publiée'}</p><ul>{build.history.map((event,i)=><li key={i}>{event.at} — {event.action}</li>)}</ul></section>
    </>}
  </main>
}

'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useAuth} from '@/components/AuthProvider'
import AuthRequired from './AuthRequired'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import {reviewLabel} from '@/lib/game-distribution/review'
import ExternalGamePlayer from './game-runtime/ExternalGamePlayer'
type Project={id:string;title:string;isPublished:boolean;activeVersionId:string|null;externalRevisionId:string|null;recordedViews:number;favorites:number;reviews:number;buildCount:number;revisionCount:number;draftState:string|null;correctionRequired:boolean}
type Event={action:string;reason:string|null;at:string}
type Build={id:string;version:string;versionId:string|null;createdAt:string;technicalStatus:string;decision:string;reason:string|null;submissionId:string|null;versionStatus:string|null;history:Event[]}
type Revision={id:string;url:string;createdAt:string;status:string;action:string|null;history:Event[]}
type Data={games:Project[];builds?:Build[];external?:Revision[]}
const actions:Record<string,string>={review:'Revue effectuée',publish:'Version acceptée',reject:'Refus',archive:'Archivage',correction_requested:'Correction demandée',corrected_build_prepared:'Build corrigé préparé',approve:'Révision acceptée',correction:'Correction demandée',suspend:'Suspension',withdraw:'Retrait'}
const externalStatuses:Record<string,string>={pending:'En attente de revue',reviewing:'Revue en cours',accepted:'Révision acceptée',rejected:'Refusée',archived:'Archivée'}
function History({events,external=false}:{events:Event[];external?:boolean}){
 return <details><summary>Historique des décisions</summary>
  {!events.length?<p>Aucune décision enregistrée.</p>:<ol className="space-y-2">{events.map((event,index)=><li key={event.at+index}><time>{new Date(event.at).toLocaleString('fr-FR')}</time> — {external&&event.action==='publish'?'Publication effectuée':actions[event.action]??event.action}{event.reason&&<p className="whitespace-pre-wrap">{event.reason}</p>}</li>)}</ol>}
  <p className="text-sm text-zinc-400">Les motifs historiques non enregistrés ne peuvent pas être reconstitués.</p>
 </details>
}
export default function DeveloperWorkspace({gameId,view='overview'}:{gameId?:string;view?:'overview'|'games'|'statistics'}){
 const {session,loading}=useAuth()
 if(loading)return <p role="status">Chargement…</p>
 if(!session)return <AuthRequired/>
 return <><p className="mb-4 text-sm text-zinc-400">Les notifications de vos prochains dépôts et décisions sont envoyées à l’adresse vérifiée de votre compte. Le suivi reste disponible ici sans attendre l’e-mail.</p><Workspace key={session.user.id+':'+(gameId??view)} token={session.access_token} gameId={gameId} view={view}/></>
}
function Workspace({token,gameId,view}:{token:string;gameId?:string;view:string}){
 const router=useRouter(),locked=useRef(false)
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[offset,setOffset]=useState(0),[reload,setReload]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>{const c=new AbortController();developerJson('/api/developer/workspace?offset='+offset+(gameId?'&gameId='+encodeURIComponent(gameId):''),token,{signal:c.signal}).then(({data})=>{if(!c.signal.aborted){setData(data);setError('')}}).catch(()=>{if(!c.signal.aborted){setData(null);setError('Impossible de charger ces projets. Vérifiez votre connexion et vos droits.')}});return()=>c.abort()},[token,gameId,offset,reload])
 async function correct(build:Build){
  if(locked.current||!window.confirm('Préparer un nouveau build ? Les versions et décisions précédentes seront conservées.'))return
  locked.current=true;setBusy(true)
  try{const {data}=await developerJson('/api/developer/drafts',token,{method:'POST',body:JSON.stringify({action:'prepare-correction',gameId,uploadId:build.id})});router.push(data.mode==='update'?'/publier-un-jeu?mode=update&game='+encodeURIComponent(data.gameId):'/publier-un-jeu?draft='+encodeURIComponent(data.gameId))}
  catch{setError('La correction n’a pas pu être préparée. Rechargez le dossier avant de réessayer.')}finally{locked.current=false;setBusy(false)}
 }
 const project=data?.games[0]
 return <section className="space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">{gameId?project?.title??'Mon jeu':view==='statistics'?'Statistiques':view==='games'?'Mes jeux':'Vue d’ensemble'}</h1><Link className="rounded border border-cyan-700 px-4 py-2 text-cyan-200" href="/publier-un-jeu">Soumettre un jeu</Link></div>
  {error&&<div role="alert"><p>{error}</p><button onClick={()=>setReload(n=>n+1)}>Réessayer</button></div>}
  {!data&&!error&&<p role="status">Chargement des projets…</p>}
  {data&&!data.games.length&&<p>Aucun projet sur cette page. Un jeu créé pour votre compte apparaît ici dès son premier brouillon.</p>}
  {data?.games.map(game=><article key={game.id} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-5">
   <h2 className="text-xl"><Link className="text-cyan-200 underline" href={'/developer/games/'+game.id}>{game.title}</Link></h2>
   {game.correctionRequired&&<p role="status" className="rounded border border-amber-800 p-3 text-amber-200">Correction demandée. <Link className="underline" href={'/developer/games/'+game.id}>Consulter le motif et remplacer le build</Link></p>}
   <p>{game.isPublished?'Visible dans le catalogue public':'Non visible publiquement'} · {game.buildCount} build(s) ZIP · {game.revisionCount} révision(s) URL</p>
   {game.draftState&&game.draftState!=='submitted'&&<Link className="inline-block text-cyan-300 underline" href={'/publier-un-jeu?draft='+game.id}>Reprendre le brouillon</Link>}
   <dl className="grid gap-3 sm:grid-cols-3">{[['Consultations de la fiche',game.recordedViews],['Favoris actuels',game.favorites],['Avis enregistrés',game.reviews]].map(([label,value])=><div key={label}><dt className="text-sm text-zinc-400">{label}</dt><dd className="text-xl">{Number(value).toLocaleString('fr-FR')}</dd></div>)}</dl>
  </article>)}
  {view==='overview'&&<p>Les corrections et décisions sont disponibles dans la fiche de chaque jeu et dans <Link className="text-cyan-300 underline" href="/developer/submissions">Mes soumissions</Link>.</p>}
  {(view==='statistics'||gameId)&&<p className="text-sm text-zinc-400">Consultations comptabilisées de la fiche, sans période ni estimation de joueurs uniques. Ce compteur ne mesure pas les parties jouées. Les favoris et avis sont des totaux actuels. Temps de jeu, rétention, revenus et mesures internes des jeux ne sont pas instrumentés.</p>}
  {gameId&&<>
   <h2 className="text-2xl">Versions et builds ZIP</h2>
   {data?.builds?.map((build,index)=><article key={build.id} className="space-y-3 rounded-xl border border-zinc-700 p-4"><h3 className="font-semibold">Version {build.version}</h3><p>{build.decision==='published'?'Version acceptée — visibilité indépendante':reviewLabel(build)}</p>{build.versionId&&project?.activeVersionId===build.versionId&&<p>{project.isPublished?'Version actuellement visible':'Version retenue, non visible publiquement'}</p>}{build.reason&&<p role="status" className="whitespace-pre-wrap text-amber-200">{build.reason}</p>}<Link className="text-cyan-300 underline" href={'/developer/builds/'+build.id}>Diagnostic et prévisualisation de ce build</Link>
    <p className="break-all text-sm text-zinc-400">Build {build.id} · {new Date(build.createdAt).toLocaleString('fr-FR')}</p>
    {offset===0&&index===0&&!['published','archived','rejected'].includes(build.decision)&&((build.decision==='pending'&&build.reason)||['failed','expired'].includes(build.technicalStatus))&&<button className="block rounded border border-cyan-700 px-3 py-2" disabled={busy} onClick={()=>correct(build)}>Remplacer par un build corrigé</button>}
    {!build.submissionId&&(['queued','validating','completed'].includes(build.technicalStatus)?<Link className="block underline" href={'/publier-un-jeu?upload='+build.id}>Terminer le dépôt</Link>:<p>Envoi incomplet : reprenez le même ZIP dans le formulaire de dépôt. <Link className="underline" href={project?.activeVersionId?'/publier-un-jeu?mode=update&game='+gameId:'/publier-un-jeu?draft='+gameId}>Reprendre le formulaire</Link></p>)}<History events={build.history}/></article>)}
   <h2 className="text-2xl">Révisions URL</h2>
   {data?.external?.map((r,index)=><article key={r.id} className="space-y-2 rounded-xl border border-zinc-700 p-4"><h3 className="break-all">Révision {r.id}</h3><p className="break-all">{r.url}</p><p>{r.action==='publish'?'Publication effectuée':actions[r.action??'']??externalStatuses[r.status]??r.status}</p><details><summary>Prévisualisation privée de cette révision</summary><ExternalGamePlayer title={project?.title??'Mon jeu'} revisionId={r.id} token={token}/></details><History external events={r.history}/>{offset===0&&index===0&&['correction','reject','publish','suspend','withdraw'].includes(r.action??'')&&<Link className="text-cyan-300 underline" href={project?.externalRevisionId?'/publier-un-jeu?mode=update&hosting=external&game='+gameId:'/publier-un-jeu?hosting=external&draft='+gameId}>Soumettre une nouvelle URL</Link>}</article>)}
   <p>100 builds et révisions par page. Chaque décision concerne la version indiquée ; les détails présentent ses 50 dernières décisions.</p>
   <div className="flex gap-4"><button disabled={!offset} onClick={()=>{setData(null);setOffset(n=>Math.max(0,n-100))}}>Versions précédentes</button><button disabled={!project||Math.max(project.buildCount,project.revisionCount)<=offset+100} onClick={()=>{setData(null);setOffset(n=>n+100)}}>Versions plus anciennes</button></div>
   {project?.activeVersionId&&<Link className="inline-block text-cyan-300 underline" href={'/publier-un-jeu?mode=update&game='+gameId}>Envoyer une nouvelle version ZIP</Link>}
  </>}
  {!gameId&&<div className="flex gap-4"><button disabled={!offset} onClick={()=>{setData(null);setOffset(n=>Math.max(0,n-50))}}>Précédent</button><button disabled={!data||data.games.length<50} onClick={()=>{setData(null);setOffset(n=>n+50)}}>Suivant</button></div>}
 </section>
}

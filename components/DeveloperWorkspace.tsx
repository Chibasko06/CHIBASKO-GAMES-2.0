'use client'
import {useEffect,useRef,useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {useAuth} from '@/components/AuthProvider'
import AuthRequired from './AuthRequired'
import {developerJson} from '@/lib/game-distribution/browser-upload'
import {buildStatus,externalStatus,decisionLabels,projectStatus,type Build,type Revision,type DecisionEvent,type WorkspaceData} from '@/lib/developerPresentation'
import ExternalGamePlayer from './game-runtime/ExternalGamePlayer'
import {Overview,Library,Statistics} from './developer/DeveloperSections'
import {Badge,DevDate,PageHeader,Pagination,Empty} from './developer/DeveloperUI'
import styles from './developer/developer.module.css'

function History({events,external=false}:{events:DecisionEvent[];external?:boolean}){return <details className={styles.details}><summary>Historique des décisions · {events.length}</summary>{!events.length?<p className={styles.muted}>Aucune décision enregistrée.</p>:<ol>{events.map((event,index)=><li key={event.at+index}><DevDate value={event.at} withTime/><p>{external&&event.action==='publish'?'Publication effectuée':decisionLabels[event.action]??'Événement enregistré'}</p>{event.reason&&<p className={styles.muted}>{event.reason}</p>}</li>)}</ol>}<p className={styles.small}>Les motifs historiques non enregistrés ne peuvent pas être reconstitués. Jusqu’à 50 décisions par version sont présentées ici.</p></details>}
function PrivatePreview({revision,title,token}:{revision:Revision;title:string;token:string}){const [open,setOpen]=useState(false);return <details className={styles.details} onToggle={e=>setOpen(e.currentTarget.open)}><summary>Prévisualiser cette révision</summary>{open&&<ExternalGamePlayer title={title} revisionId={revision.id} token={token}/>}</details>}
export default function DeveloperWorkspace({gameId,view='overview'}:{gameId?:string;view?:'overview'|'games'|'statistics'}){
 const {session,loading}=useAuth()
 if(loading)return <p role="status">Chargement de votre espace…</p>
 if(!session)return <AuthRequired/>
 return <Workspace key={session.user.id+':'+session.access_token+':'+(gameId??view)} token={session.access_token} gameId={gameId} view={view}/>
}
function Workspace({token,gameId,view}:{token:string;gameId?:string;view:string}){
 const router=useRouter(),locked=useRef(false)
 const [data,setData]=useState<WorkspaceData|null>(null),[error,setError]=useState(''),[offset,setOffset]=useState(0),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[limited,setLimited]=useState(false)
 useEffect(()=>{const c=new AbortController();void (async()=>{
  try{
   const first=await developerJson('/api/developer/workspace?offset='+offset+(gameId?'&gameId='+encodeURIComponent(gameId):''),token,{signal:c.signal});const result:WorkspaceData={...first.data,games:[...first.data.games]};let truncated=false
   if(!gameId&&view!=='games'){let page=first.data.games;for(let start=50;page.length===50&&start<500;start+=50){page=(await developerJson('/api/developer/workspace?offset='+start,token,{signal:c.signal})).data.games;result.games.push(...page)}truncated=result.games.length>=500}
   if(!c.signal.aborted){setData(result);setLimited(truncated);setError('')}
  }catch{if(!c.signal.aborted){setData(null);setError('Impossible de charger ces projets. Vérifiez votre connexion et vos droits.')}}
 })();return()=>c.abort()},[token,gameId,offset,reload,view])
 async function correct(build:Build){
  if(locked.current||!window.confirm('Préparer un nouveau build ? Les versions et décisions précédentes seront conservées.'))return
  locked.current=true;setBusy(true)
  try{const {data}=await developerJson('/api/developer/drafts',token,{method:'POST',body:JSON.stringify({action:'prepare-correction',gameId,uploadId:build.id})});router.push(data.mode==='update'?'/publier-un-jeu?mode=update&game='+encodeURIComponent(data.gameId):'/publier-un-jeu?draft='+encodeURIComponent(data.gameId))}
  catch{setError('La correction n’a pas pu être préparée. Rechargez le dossier avant de réessayer.')}finally{locked.current=false;setBusy(false)}
 }
 function changePage(value:number){setData(null);setOffset(value)}
 const project=data?.games[0],title=gameId?project?.title??'Gestion du jeu':view==='statistics'?'Statistiques':view==='games'?'Mes jeux':'Vue d’ensemble'
 const descriptions={overview:'Vos projets, les dernières nouvelles et les prochaines étapes pour publier.',games:'Retrouvez chaque jeu et gérez ses versions depuis sa fiche permanente.',statistics:'Les données enregistrées de vos jeux, sans estimation de joueurs ou de revenus.'}
 return <section className={styles.page}>
  {gameId&&<Link href="/developer/games" className={styles.link}>← Mes jeux</Link>}
  <PageHeader eyebrow={gameId?'Gestion du jeu':view==='overview'?'Votre atelier de publication':undefined} title={title} description={gameId?'Versions, décisions et corrections : tout le suivi de ce jeu, au même endroit.':descriptions[view as keyof typeof descriptions]}/>
  {error&&<div role="alert" className={styles.notice}><p>{error}</p><button className={styles.secondary} onClick={()=>setReload(n=>n+1)}>Réessayer</button></div>}
  {!data&&!error&&<div role="status" aria-label="Chargement des projets"><p className={styles.muted}>Chargement des projets…</p><div className={`${styles.metrics} mt-4`}><div className={styles.skeleton}/><div className={styles.skeleton}/><div className={styles.skeleton}/></div></div>}
  {limited&&<p role="status" className={styles.notice}>Cette synthèse est limitée aux 500 premiers projets accessibles. Consultez la bibliothèque paginée pour les autres.</p>}
  {data&&!gameId&&view==='overview'&&<Overview games={data.games} token={token} limited={limited}/>}
  {data&&!gameId&&view==='games'&&<Library games={data.games} token={token}/>}
  {data&&!gameId&&view==='statistics'&&<Statistics games={data.games} token={token}/>}
  {data&&gameId&&!project&&<Empty title="Ce projet n’est pas disponible">Vérifiez vos droits ou revenez à votre bibliothèque.</Empty>}
  {gameId&&project&&<>
   <section className={styles.panel}><div className={styles.split}><div><Badge {...projectStatus(project)}/><p className={`${styles.muted} mt-3`}>{project.isPublished?'Le jeu est actuellement visible dans le catalogue.':'Le jeu n’est pas visible dans le catalogue public.'} L’acceptation d’une version et la visibilité du jeu sont deux états distincts.</p></div><div className={styles.actions}>{project.activeVersionId&&<Link className={styles.button} href={'/publier-un-jeu?mode=update&game='+gameId}>Envoyer une nouvelle version ZIP</Link>}{project.draftState&&project.draftState!=='submitted'&&<Link className={styles.secondary} href={'/publier-un-jeu?draft='+gameId}>Reprendre le brouillon</Link>}</div></div></section>
   {project.buildCount>0&&<div className={styles.sectionHeading}><h2>Versions et builds ZIP</h2><span className={styles.small}>{project.buildCount} build(s) conservé(s)</span></div>}
   {project.buildCount>0&&!data?.builds?.length&&<p className={styles.muted}>Aucun build ZIP sur cette page.</p>}
   {data?.builds?.map((build,index)=><article key={build.id} className={styles.submission}><div className={styles.split}><div><p className={styles.eyebrow}>Build ZIP</p><h3>Version {build.version}</h3><DevDate value={build.createdAt} withTime/></div><Badge {...buildStatus(build)}/></div>
    {build.versionId&&project.activeVersionId===build.versionId&&<p className={`${styles.link} mt-3`}>{project.isPublished?'Version actuellement visible':'Version retenue, non visible publiquement'}</p>}
    {build.reason&&<div className={styles.reason}><strong>Motif de la revue</strong><p>{build.reason}</p></div>}
    <div className={styles.actions}><Link className={styles.secondary} href={'/developer/builds/'+build.id}>Diagnostic et prévisualisation</Link>
    {offset===0&&index===0&&!['published','archived','rejected'].includes(build.decision)&&((build.decision==='pending'&&build.reason)||['failed','expired'].includes(build.technicalStatus))&&<button className={styles.button} disabled={busy} onClick={()=>correct(build)}>{busy?'Préparation…':'Remplacer par un build corrigé'}</button>}
    {!build.submissionId&&(['queued','validating','completed'].includes(build.technicalStatus)?<Link className={styles.link} href={'/publier-un-jeu?upload='+build.id}>Terminer le dépôt</Link>:<Link className={styles.link} href={project.activeVersionId?'/publier-un-jeu?mode=update&game='+gameId:'/publier-un-jeu?draft='+gameId}>Reprendre l’envoi incomplet</Link>)}</div>
    <p className={styles.identifier}>Identifiant du build : {build.id}</p><History events={build.history}/></article>)}
   {project.revisionCount>0&&<div className={styles.sectionHeading}><h2>Révisions URL</h2><span className={styles.small}>{project.revisionCount} révision(s) conservée(s)</span></div>}
   {project.revisionCount>0&&!data?.external?.length&&<p className={styles.muted}>Aucune révision externe sur cette page.</p>}
   {data?.external?.map((r,index)=><article key={r.id} className={styles.submission}><div className={styles.split}><div><p className={styles.eyebrow}>URL externe · HTML5 classique</p><h3>Révision {r.id.slice(0,8)}</h3><DevDate value={r.createdAt} withTime/></div><Badge {...externalStatus(r.action,r.status)}/></div><p className={`${styles.identifier} mt-3`}>{r.url}</p><p className={styles.identifier}>Identifiant de révision : {r.id}</p><PrivatePreview revision={r} title={project.title} token={token}/><History external events={r.history}/>{offset===0&&index===0&&['correction','reject','publish','suspend','withdraw'].includes(r.action??'')&&<Link className={`${styles.secondary} mt-4`} href={project.externalRevisionId?'/publier-un-jeu?mode=update&hosting=external&game='+gameId:'/publier-un-jeu?hosting=external&draft='+gameId}>Soumettre une nouvelle URL</Link>}</article>)}
   {!project.buildCount&&!project.revisionCount&&<Empty title="Votre premier dépôt reste à préparer">Reprenez le brouillon de ce jeu pour envoyer un build ou une URL, sans créer une deuxième fiche.</Empty>}
   {Math.max(project.buildCount,project.revisionCount)>100&&<><p className={styles.small}>100 builds et révisions par page. Une correction conserve toujours les versions précédentes.</p><Pagination offset={offset} size={100} hasNext={Math.max(project.buildCount,project.revisionCount)>offset+100} onChange={changePage}/></>}
   <p className={styles.notice}>Temps de jeu, rétention et revenus ne sont pas mesurés. Retrouvez les compteurs disponibles dans <Link href="/developer/statistics">Statistiques</Link>.</p>
  </>}
  {!gameId&&view==='games'&&(offset>0||data?.games.length===50)&&<Pagination offset={offset} size={50} hasNext={!!data&&data.games.length===50} onChange={changePage}/>}
 </section>
}

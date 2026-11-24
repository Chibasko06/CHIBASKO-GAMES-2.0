'use client'
import AuthRequired from '@/components/AuthRequired'
import ExternalSubmissions from './ExternalSubmissions'
import Link from 'next/link'
import {useEffect,useState,useRef} from 'react'
import {useRouter} from 'next/navigation'
import {useAuth} from '@/components/AuthProvider'
import {developerJson,SubmissionError} from '@/lib/game-distribution/browser-upload'
import {buildStatus,type Build} from '@/lib/developerPresentation'
import {Badge,DevDate,PageHeader,Pagination,Empty} from './developer/DeveloperUI'
import styles from './developer/developer.module.css'

type Row=Build&{gameId:string;title:string;editorialComplete:boolean}
export default function DeveloperSubmissions(){const {session,loading}=useAuth();if(loading)return <p role="status">Chargement…</p>;if(!session)return <AuthRequired/>;return <List key={session.user.id+':'+session.access_token} token={session.access_token}/>}
function List({token}:{token:string}){
 const router=useRouter(),locked=useRef(false)
 const [preparing,setPreparing]=useState<string|null>(null),[rows,setRows]=useState<Row[]|null>(null),[offset,setOffset]=useState(0),[reload,setReload]=useState(0),[error,setError]=useState(''),[hosting,setHosting]=useState('zip'),[filter,setFilter]=useState('all')
 async function prepareCorrection(row:Row){
  if(locked.current||!window.confirm('Préparer un nouveau dépôt pour ce jeu ? L’archive et la soumission précédentes seront conservées.'))return
  locked.current=true;setPreparing(row.id);setError('')
  try{const {data}=await developerJson('/api/developer/drafts',token,{method:'POST',body:JSON.stringify({action:'prepare-correction',gameId:row.gameId,uploadId:row.id})});router.push(data.mode==='update'?'/publier-un-jeu?mode=update&game='+encodeURIComponent(data.gameId):'/publier-un-jeu?draft='+encodeURIComponent(data.gameId))}
  catch(cause){setError(cause instanceof SubmissionError&&cause.code==='developer_email_unverified'?'Vérifiez votre adresse dans Mon profil développeur avant de préparer cette correction.':'Impossible de préparer cette correction. Rechargez le dossier avant de réessayer.')}finally{locked.current=false;setPreparing(null)}
 }
 useEffect(()=>{if(hosting!=='zip')return;const c=new AbortController();developerJson('/api/developer/submissions?offset='+offset,token,{signal:c.signal}).then(b=>{if(!c.signal.aborted){setRows(b.data);setError('')}}).catch(()=>{if(!c.signal.aborted){setRows(null);setError('Impossible de charger les soumissions.')}});return()=>c.abort()},[token,offset,reload,hosting])
 const shown=rows?.filter(r=>filter==='all'||filter==='correction'&&r.decision==='pending'&&!!r.reason||filter==='accepted'&&r.decision==='published'||filter==='waiting'&&r.decision==='pending'&&!r.reason)
 return <section className={styles.page}><PageHeader title="Mes soumissions" description="Suivez chaque dépôt, consultez les décisions et préparez les corrections demandées."/>
  <div className={styles.notice}>Une vérification technique réussie autorise la prévisualisation, sans garantir l’acceptation ni la mise en ligne. Chaque décision reste liée à la version examinée.</div>
  <div className={styles.tabs} aria-label="Hébergement des soumissions"><button aria-pressed={hosting==='zip'} onClick={()=>setHosting('zip')}>Builds ZIP · Chibasko Games</button><button aria-pressed={hosting==='external'} onClick={()=>setHosting('external')}>Révisions URL · Externe</button></div>
  {hosting==='external'?<ExternalSubmissions token={token}/>:<>
  <div className={styles.filters}><label>Statut de revue<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Tous les statuts</option><option value="correction">Correction demandée</option><option value="waiting">En attente de décision</option><option value="accepted">Version acceptée</option></select></label><button className={styles.secondary} onClick={()=>{setRows(null);setReload(n=>n+1)}}>Recharger le suivi</button></div>
  {error&&<p role="alert" className={styles.notice}>{error}</p>}{!rows&&!error&&<p role="status">Chargement des soumissions…</p>}
  {rows&&!shown?.length&&!error&&<Empty title="Aucun build dans cette sélection" icon="send">Les builds de vos jeux apparaîtront ici après leur envoi. Les propositions historiques sans build restent conservées dans l’administration.</Empty>}
  {shown?.map(r=><article key={r.id} className={styles.submission}><div className={styles.split}><div><p className={styles.eyebrow}>Build ZIP · version {r.version}</p><h2><Link href={'/developer/games/'+r.gameId}>{r.title}</Link></h2><p className={styles.small}>Déposé le <DevDate value={r.createdAt} withTime/></p></div><Badge {...buildStatus(r)}/></div>
   {r.reason&&<div className={styles.reason}><strong>{r.decision==='pending'?'Correction attendue':'Motif de la décision'}</strong><p>{r.reason}</p></div>}
   <div className={styles.actions}><Link className={styles.secondary} href={'/developer/builds/'+r.id}>Diagnostic et prévisualisation</Link><Link className={styles.link} href={'/developer/games/'+r.gameId}>Historique du jeu →</Link>
   {offset===0&&rows?.find(row=>row.gameId===r.gameId)?.id===r.id&&(['failed','expired'].includes(r.technicalStatus)||r.decision==='pending'&&r.reason)&&!['published','rejected','archived'].includes(r.decision)&&<button className={styles.button} disabled={!!preparing} onClick={()=>prepareCorrection(r)}>{preparing===r.id?'Préparation…':'Préparer un build corrigé'}</button>}
   {!r.editorialComplete&&(['queued','validating','completed'].includes(r.technicalStatus)?<Link className={styles.link} href={'/publier-un-jeu?upload='+r.id}>Terminer les informations éditoriales</Link>:<p className={styles.small}>Envoi incomplet : reprenez le même ZIP dans le formulaire de dépôt.</p>)}</div><details className={styles.details}><summary>Identifiants du dépôt</summary><p className={styles.identifier}>Build : {r.id}</p><p className={styles.identifier}>Jeu : {r.gameId}</p></details></article>)}
  <p className={styles.small}>50 builds par page. Le filtre s’applique à la page affichée ; l’historique complet reste accessible depuis la fiche de chaque jeu.</p><Pagination offset={offset} size={50} hasNext={rows?.length===50} onChange={n=>{setRows(null);setOffset(n)}}/>
  </>}
 </section>
}

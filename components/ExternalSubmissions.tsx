'use client'
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {developerJson,SubmissionError} from '@/lib/game-distribution/browser-upload'
import ExternalGamePlayer from './game-runtime/ExternalGamePlayer'
import {externalStatus} from '@/lib/developerPresentation'
import {Badge,DevDate,Pagination,Empty} from './developer/DeveloperUI'
import styles from './developer/developer.module.css'

type Revision = {id:string;gameId:string;title:string;url:string;createdAt:string;status:string;action:string|null;reason:string|null;latest:boolean;updateOnly:boolean}
const revisable = new Set(['correction','reject','publish','suspend','withdraw'])

type Props={token:string;updatesOnly?:boolean;gameId?:string}
export default function ExternalSubmissions(props:Props){return <RevisionList key={props.token+':'+(props.gameId??'')+':'+!!props.updatesOnly} {...props}/>}
function RevisionList({token,updatesOnly=false,gameId}:Props){
  const [rows,setRows]=useState<Revision[]>([])
  const [offset,setOffset]=useState(0),[reload,setReload]=useState(0)
  const [loading,setLoading]=useState(true),[error,setError]=useState(false)
  const [preview,setPreview]=useState<string|null>(null)
  useEffect(()=>{
    const controller=new AbortController()
    developerJson(gameId?'/api/developer/workspace?gameId='+encodeURIComponent(gameId):'/api/developer/submissions/external?offset='+offset,token,{signal:controller.signal})
      .then(({data})=>{if(!controller.signal.aborted){setRows(gameId?data.external.map((row:Revision&{history:{reason:string|null}[]},index:number)=>({...row,gameId,title:data.games[0].title,latest:index===0,updateOnly:!!data.games[0].externalRevisionId,reason:row.history[0]?.reason??null})):data);setError(false);setLoading(false)}})
      .catch(()=>{if(!controller.signal.aborted){setRows([]);setError(true);setLoading(false)}})
    return()=>controller.abort()
  },[token,offset,reload,gameId])
  const shown=updatesOnly?rows.filter(row=>row.latest&&row.updateOnly):rows
  return <section className={styles.stack} aria-label="Soumissions externes">
    <h2 className="text-xl">Hébergement externe</h2><p className={styles.muted}>Chaque URL est enregistrée dans une révision. Une correction conserve la précédente et repasse en revue.</p>
    {loading?<p role="status">Chargement des révisions…</p>:error?<p role="alert" className={styles.notice}>Impossible de charger les révisions externes.</p>:!shown.length?<Empty title="Aucune révision externe" icon="globe">Les jeux proposés par URL HTTPS apparaîtront ici.</Empty>:null}
    {!loading&&shown.map(row=><article key={row.id} className={styles.submission}>
      <div className={styles.split}><div><p className={styles.eyebrow}>URL externe · HTML5 classique</p><h3><Link href={'/developer/games/'+row.gameId}>{row.title}</Link></h3><p className={styles.small}>Déposée le <DevDate value={row.createdAt} withTime/></p></div><Badge {...externalStatus(row.action,row.status)}/></div>
      <p className={styles.identifier}>URL : {row.url}</p>
      <details className={styles.details}><summary>Identifiant de révision</summary><p className={styles.identifier}>{row.id}</p></details>
      {row.reason&&<div className={styles.reason}><strong>Motif de la revue</strong><p>{row.reason}</p></div>}
      {!updatesOnly&&<details onToggle={e=>setPreview(e.currentTarget.open?row.id:null)}>
        <summary className="cursor-pointer py-3 text-cyan-300">Prévisualisation privée</summary>
        {preview===row.id&&<ExternalGamePlayer title={row.title} revisionId={row.id} token={token}/>}
      </details>}
      {row.latest&&row.action&&revisable.has(row.action)&&(row.updateOnly
        ? <RevisionForm key={row.id} row={row} token={token} onSubmitted={()=>{setOffset(0);setReload(n=>n+1)}}/>
        : <Link className={styles.secondary} href={'/publier-un-jeu?hosting=external&draft='+encodeURIComponent(row.gameId)}>Soumettre une nouvelle URL depuis le brouillon</Link>)}
      {!updatesOnly&&<Link className={styles.link} href={'/developer/games/'+row.gameId}>Historique du jeu →</Link>}
    </article>)}
    <div className={styles.stack}>
      {!gameId&&<Pagination offset={offset} size={50} hasNext={rows.length===50} onChange={n=>{setLoading(true);setPreview(null);setOffset(n)}}/>}
      <button type="button" className={styles.secondary} onClick={()=>{setLoading(true);setReload(n=>n+1)}}>Recharger les révisions</button>
    </div>
  </section>
}

function RevisionForm({row,token,onSubmitted}:{row:Revision;token:string;onSubmitted:()=>void}){
  const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const request=useRef<string|null>(null),locked=useRef(false)
  async function submit(){
    if(locked.current)return
    locked.current=true;setBusy(true);setError('')
    try{
      await developerJson('/api/developer/submissions/external',token,{method:'POST',
        body:JSON.stringify({gameId:row.gameId,revisionId:request.current??=crypto.randomUUID(),url,ownership:true})})
      setUrl('');request.current=null;onSubmitted()
    }catch(cause){
      setError(cause instanceof SubmissionError&&cause.code==='invalid_external_game_url'
        ?'Saisissez une URL HTTPS publique valide.':'Impossible de soumettre cette révision. Actualisez le dossier avant de réessayer.')
    }finally{locked.current=false;setBusy(false)}
  }
  return <details>
    <summary className="cursor-pointer text-cyan-300">Soumettre une nouvelle URL</summary>
    <form className="mt-3 space-y-2" onSubmit={event=>{event.preventDefault();void submit()}}>
      <label className="block">Nouvelle URL HTTPS<input className="block w-full rounded border border-zinc-700 bg-zinc-950 p-2" type="url" required maxLength={2048} value={url} disabled={busy}
        onChange={event=>{setUrl(event.target.value);request.current=null;setError('')}}/></label>
      <label className="block"><input type="checkbox" required disabled={busy}/> Je dispose des droits de diffusion.</label>
      <button type="submit" disabled={busy} className="rounded border border-cyan-700 px-3 py-2">{busy?'Envoi…':'Envoyer pour revue'}</button>
      {error&&<p role="alert">{error}</p>}
    </form>
  </details>
}

'use client'
import {useEffect,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import Link from 'next/link'
import AuthRequired from './AuthRequired'
import {buildStatus} from '@/lib/developerPresentation'
import {Badge,PageHeader} from './developer/DeveloperUI'
import styles from './developer/developer.module.css'
import {previewUnavailable,type DeveloperBuildDetails} from '@/lib/game-distribution/developer-build-preview'
import {describeValidation} from '@/lib/game-distribution/validation-diagnostics'
import DeveloperBuildPreview from './game-runtime/DeveloperBuildPreview'
export default function BuildReviewStatus({id}:{id:string}) {
  const {session,loading}=useAuth()
  if(loading)return <p role="status">Chargement…</p>
  if(!session)return <AuthRequired/>
  return <Status key={id+':'+session.access_token} id={id} token={session.access_token}/>
}
function Status({id,token}:{id:string;token?:string}) {
  const [data,setData]=useState<DeveloperBuildDetails|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0)
  useEffect(()=>{if(!token)return;const controller=new AbortController()
    fetch('/api/developer/uploads/'+encodeURIComponent(id)+'/review',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error('status');return r.json()}).then(b=>{if(!controller.signal.aborted){setData(b.data);setError('')}})
      .catch(()=>{if(!controller.signal.aborted){setData(null);setError('Build introuvable ou accès refusé.')}})
    return()=>controller.abort()
  },[id,token,reload])
  const diagnostic=data?.diagnostic?describeValidation(data.diagnostic):null
  return <div className={styles.page}><Link className={styles.link} href={data?'/developer/games/'+data.gameId:'/developer/submissions'}>← {data?'Dossier du jeu':'Mes soumissions'}</Link><PageHeader title="Diagnostic et prévisualisation" description="Résultats de la tentative de validation et tests privés de ce build précis." action={false}/>
    {!token&&<p>Connexion requise pour consulter ce build.</p>}{error&&<p role="alert">{error}</p>}
    {token&&!data&&!error&&<p role="status">Chargement du build…</p>}
    {data&&<>
      <section className={styles.panel}><div className={styles.split}><div><p className={styles.eyebrow}>Tentative {data.attempt}</p><h2 className="text-xl font-bold">{data.title} · {data.version}</h2></div><Badge {...buildStatus(data)}/></div>
      {data.reason&&<p className={styles.reason}>{data.reason}</p>}
      {data.mode&&<p className={`${styles.muted} mt-3`}>Mode du build : {data.mode==='classic'?'HTML5 classique':'SDK Chibasko Games'}</p>}
      {data.mode==='sdk'&&<p className={styles.small}>Analyse statique : {data.scan?.signals?'indices SDK détectés':data.scan?.complete?'aucun indice détecté':'résultat indéterminé'}. Le dialogue se vérifie dans le lecteur.</p>}</section>
      {diagnostic&&<section className={styles.panel}>
        <h3 className="font-semibold">Diagnostic technique de cette tentative</h3>
        <p>{diagnostic.explanation} · {diagnostic.phase}</p>
        {diagnostic.path&&<p>Fichier : {diagnostic.path}</p>}
        {diagnostic.field&&<p>Champ : {diagnostic.field}</p>}
        <p>{diagnostic.action}</p>
      </section>}
      {data.previewVersionId&&token
        ? <DeveloperBuildPreview key={data.previewVersionId+':'+data.attempt} build={data} token={token}/>
        : <p className={styles.notice}>{previewUnavailable(data)}</p>}
    </>}
    <div className={styles.actions}><button className={styles.secondary} onClick={()=>setReload(n=>n+1)}>Actualiser le statut</button></div></div>
}

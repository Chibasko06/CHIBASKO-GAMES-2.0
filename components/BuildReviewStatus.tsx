'use client'
import {useEffect,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {REVIEW_NOTICE,reviewLabel} from '@/lib/game-distribution/review'
import {previewUnavailable,type DeveloperBuildDetails} from '@/lib/game-distribution/developer-build-preview'
import {describeValidation} from '@/lib/game-distribution/validation-diagnostics'
import DeveloperBuildPreview from './game-runtime/DeveloperBuildPreview'
export default function BuildReviewStatus({id}:{id:string}) {
  const {session}=useAuth()
  return <Status key={id+':'+(session?.user.id??'anonymous')} id={id} token={session?.access_token}/>
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
  return <div className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl">Suivi du build</h1><p>{REVIEW_NOTICE}</p>
    {!token&&<p>Connexion requise pour consulter ce build.</p>}{error&&<p role="alert">{error}</p>}
    {token&&!data&&!error&&<p role="status">Chargement du build…</p>}
    {data&&<>
      <h2 className="text-xl">{data.title} · {data.version}</h2>
      <p>{reviewLabel(data)} · Tentative {data.attempt}</p>
      {data.reason&&<p>{data.reason}</p>}
      {data.mode&&<p>Mode du build : {data.mode==='classic'?'HTML5 classique':'SDK Chibasko Games'}</p>}
      {data.mode==='sdk'&&<p>Analyse statique : {data.scan?.signals?'indices SDK détectés':data.scan?.complete?'aucun indice détecté':'résultat indéterminé'}. Le dialogue se vérifie dans le lecteur.</p>}
      {diagnostic&&<section className="space-y-1 rounded border border-zinc-700 p-4">
        <h3 className="font-semibold">Diagnostic technique de cette tentative</h3>
        <p>{diagnostic.explanation} · {diagnostic.phase}</p>
        {diagnostic.path&&<p>Fichier : {diagnostic.path}</p>}
        {diagnostic.field&&<p>Champ : {diagnostic.field}</p>}
        <p>{diagnostic.action}</p>
      </section>}
      {data.previewVersionId&&token
        ? <DeveloperBuildPreview key={data.previewVersionId+':'+data.attempt} build={data} token={token}/>
        : <p>{previewUnavailable(data)}</p>}
    </>}
    <button onClick={()=>setReload(n=>n+1)}>Actualiser le statut</button></div>
}

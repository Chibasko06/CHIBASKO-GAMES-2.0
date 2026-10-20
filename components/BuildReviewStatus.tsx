'use client'
import {useEffect,useState} from 'react'
import {useAuth} from '@/components/AuthProvider'
import {REVIEW_NOTICE,reviewLabel,type ReviewSummary} from '@/lib/game-distribution/review'
export default function BuildReviewStatus({id}:{id:string}) {
  const {session}=useAuth()
  return <Status key={session?.user.id??'anonymous'} id={id} token={session?.access_token}/>
}
function Status({id,token}:{id:string;token?:string}) {
  const [data,setData]=useState<ReviewSummary|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0)
  useEffect(()=>{if(!token)return;const controller=new AbortController()
    fetch('/api/developer/uploads/'+encodeURIComponent(id)+'/review',{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:controller.signal})
      .then(async r=>{if(!r.ok)throw Error('status');return r.json()}).then(b=>{if(!controller.signal.aborted){setData(b.data);setError('')}})
      .catch(()=>{if(!controller.signal.aborted){setData(null);setError('Build introuvable ou accès refusé.')}})
    return()=>controller.abort()
  },[id,token,reload])
  return <main className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl">Suivi du build</h1><p>{REVIEW_NOTICE}</p>
    {!token&&<p>Connexion requise pour consulter ce build.</p>}{error&&<p role="alert">{error}</p>}
    {data&&<><p>{reviewLabel(data)}</p>{data.reason&&<p>{data.reason}</p>}</>}
    <button onClick={()=>setReload(n=>n+1)}>Actualiser le statut</button></main>
}

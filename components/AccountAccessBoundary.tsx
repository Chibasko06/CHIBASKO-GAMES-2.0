'use client'
import {useEffect,useState} from 'react'
import Link from 'next/link'
import {useAuth} from './AuthProvider'
import {fetchJson} from '@/lib/asyncOperation'
import {socialButton} from '@/lib/social'

// Cette frontière présente l'état du compte ; les autorisations restent contrôlées en SQL.
export default function AccountAccessBoundary({children}:{children:React.ReactNode}){
 const {session,loading}=useAuth(),token=session?.access_token
 const [access,setAccess]=useState<{token:string;blocked:boolean}|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0)
 useEffect(()=>{if(!token)return;let active=true;const controller=new AbortController()
  void Promise.resolve().then(async()=>{if(!active)return;setError('');setAccess(null);const {response,payload}=await fetchJson('/api/account/moderation?view=access',{headers:{Authorization:'Bearer '+token},signal:controller.signal});if(!response.ok||typeof payload.data?.blocked!=='boolean')throw Error('La vérification du compte est temporairement indisponible.');if(active)setAccess({token,blocked:payload.data.blocked})})
   .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Vérification indisponible.')})
  return()=>{active=false;controller.abort()}
 },[token,attempt])
 if(!loading&&!token)return children
 if(!loading&&access!==null&&access.token===token&&!access.blocked)return children
 return <section className="mx-auto min-h-80 max-w-2xl space-y-5 px-4 py-10">
  {error?<p role="alert" className="text-red-200">{error}</p>:access!==null&&access.token===token&&access.blocked?<><h1 className="text-2xl font-bold">Compte restreint</h1><p className="text-zinc-300">Cet espace n’est pas accessible pendant la restriction. Tu peux consulter le motif et demander un réexamen.</p></>:<p role="status">Vérification du compte…</p>}
  <div className="flex flex-wrap gap-3"><Link href="/account/moderation" className={socialButton}>Décisions et recours</Link>{!loading&&<button className={socialButton} onClick={()=>setAttempt(value=>value+1)}>Vérifier l’accès</button>}<Link href="/games" className={socialButton}>Catalogue public</Link></div>
 </section>
}

'use client'
import AuthActions from './AuthActions'
import {usePathname} from 'next/navigation'
import {useSyncExternalStore} from 'react'
import {safeAuthNext} from '@/lib/authRedirect'

const subscribe=(callback:()=>void)=>{window.addEventListener('popstate',callback);return()=>window.removeEventListener('popstate',callback)}
const destination=()=>safeAuthNext(window.location.pathname+window.location.search)
export default function AuthRequired({next:requestedNext,message='Connectez-vous ou créez un compte pour effectuer cette action.'}:{next?:string;message?:string}={}){
 const pathname=usePathname()
 const next=useSyncExternalStore(subscribe,destination,()=>safeAuthNext(pathname))
 return <div className="min-w-0 max-w-full space-y-3 rounded-xl border border-cyan-900 bg-zinc-950 p-4 text-sm break-words" role="status">
  <p>{message}</p>
  <AuthActions next={requestedNext??next}/>
 </div>
}

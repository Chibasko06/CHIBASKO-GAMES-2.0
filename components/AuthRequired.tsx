'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {useSyncExternalStore} from 'react'
import {safeAuthNext} from '@/lib/authRedirect'

const subscribe=(callback:()=>void)=>{window.addEventListener('popstate',callback);return()=>window.removeEventListener('popstate',callback)}
const destination=()=>safeAuthNext(window.location.pathname+window.location.search)
export default function AuthRequired(){
 const pathname=usePathname()
 const next=useSyncExternalStore(subscribe,destination,()=>safeAuthNext(pathname))
 const button='inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300'
 return <div className="basis-full space-y-3 rounded-xl border border-cyan-900 bg-zinc-950 p-4 text-sm" role="status">
  <p>Connectez-vous ou créez un compte pour effectuer cette action.</p>
  <div className="flex flex-wrap gap-2"><Link className={button+' border-cyan-400 bg-cyan-400 text-black'} href={'/login?next='+encodeURIComponent(next)}>Se connecter</Link><Link className={button+' border-cyan-700 text-cyan-200'} href={'/register?next='+encodeURIComponent(next)}>Créer un compte</Link></div>
 </div>
}

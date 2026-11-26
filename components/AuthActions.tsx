'use client'
import Link from 'next/link'
import {safeAuthNext} from '@/lib/authRedirect'

export default function AuthActions({next}:{next:string}){
 const query='?next='+encodeURIComponent(safeAuthNext(next))
 const button='inline-flex min-h-11 max-w-full items-center justify-center rounded-lg border px-4 py-2 text-center text-sm font-semibold break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300'
 return <div data-auth-actions className="flex min-w-0 flex-wrap gap-2"><Link data-auth-primary className={button+' border-cyan-400 bg-cyan-400 text-black'} href={'/login'+query}>Se connecter</Link><Link className={button+' border-cyan-700 bg-zinc-950 text-cyan-200'} href={'/register'+query}>Créer un compte</Link></div>
}

import Link from 'next/link'
import { safeAuthNext } from '@/lib/authRedirect'
export const multiplayerButton='rounded-full border border-cyan-700 px-5 py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-950/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50'
export function AuthInvitation({next}:{next:string}){
 const query='?next='+encodeURIComponent(safeAuthNext(next))
 return <div role="status" className="space-y-3 text-sm text-zinc-300"><p>Connecte-toi à ton compte Chibasko Games pour rejoindre ou créer une partie.</p><div className="flex flex-wrap gap-3"><Link className={multiplayerButton} href={'/login'+query}>Se connecter</Link><Link className={multiplayerButton} href={'/register'+query}>Créer un compte</Link></div></div>
}

import Link from 'next/link'
import type { GameCapabilities } from '@chibaskogames/sdk'
export default function ArtifactOnlineLinks({capabilities,slug}:{capabilities:GameCapabilities|undefined;slug:string}) {
 return <section aria-label="Modes de jeu" className="flex flex-wrap gap-4 rounded-2xl border border-cyan-900 p-5">
  {capabilities?.online?.access.map(mode=><Link key={mode} href={`/games/${slug}/${mode==='public'?'online':'private'}`} className="rounded-xl border border-cyan-700 px-5 py-3 font-bold text-cyan-100">{mode==='public'?'Jouer en ligne':'Partie privée'}</Link>)}
  {capabilities?.local && <Link href={`/games/${slug}/local`} className="rounded-xl border border-cyan-700 px-5 py-3 font-bold text-cyan-100">Jouer en local</Link>}
  {!capabilities && <p role="status">Ce jeu est temporairement indisponible.</p>}
 </section>
}

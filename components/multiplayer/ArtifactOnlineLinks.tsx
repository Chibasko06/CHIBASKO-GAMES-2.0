import Link from 'next/link'
import type { GameCapabilities } from '@chibaskogames/sdk'
export default function ArtifactOnlineLinks({capabilities,slug,availableAccess=[]}:{capabilities:GameCapabilities|undefined;slug:string;availableAccess?:readonly ('public'|'private')[]}) {
 return <section aria-label="Modes de jeu" className="flex flex-wrap items-stretch gap-3 py-3">
  {capabilities?.local && <Link href={`/games/${slug}/local`} className="flex items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 font-bold text-zinc-950 hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">Jouer en local</Link>}
  {capabilities?.online?.access.map(mode=>availableAccess.includes(mode)
    ? <Link key={mode} href={`/games/${slug}/${mode==='public'?'online':'private'}`} className="flex items-center rounded-xl border border-cyan-700 px-5 py-3 font-bold text-cyan-100 focus-visible:outline-2 focus-visible:outline-cyan-300">{mode==='public'?'Jouer en ligne':'Partie privée'}</Link>
    : <button key={mode} type="button" disabled className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-2 text-left text-zinc-400 disabled:cursor-not-allowed"><span className="block font-semibold">{mode==='public'?'Jouer en ligne':'Partie privée'}</span><span className="block text-xs">Serveur indisponible</span></button>)}
  {!capabilities && <p role="status">Ce jeu est temporairement indisponible.</p>}
 </section>
}

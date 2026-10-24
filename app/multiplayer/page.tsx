import type { Metadata } from 'next'
import { getCataloguePage } from '@/lib/queries/games'
import {pageNumber} from '@/lib/pagination'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'
import MultiplayerSection from '@/components/multiplayer/MultiplayerSection'


export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Jeux multijoueurs gratuits en ligne',
  description: 'Découvre les jeux multijoueurs Chibasko Games et retrouve tes amis pour jouer ensemble depuis ton navigateur.',
  path: '/multiplayer',
})
export default async function MultiplayerPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const page=pageNumber((await searchParams).page)
  const games = await getCataloguePage({type:'multiplayer',offset:(page-1)*24})
  return <div className="space-y-10 sm:space-y-12">
    <header className="rounded-[28px] border border-cyan-950/80 bg-gradient-to-br from-cyan-950/25 to-zinc-950 px-5 py-7 sm:p-9">
      <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Chibasko Games</p>
      <h1 className="mt-3 text-3xl font-black uppercase text-white sm:text-4xl">Multijoueur</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-300">Joue avec tes amis sur Chibasko Games.</p>
    </header>
    <MultiplayerSection games={games.items} />
    <nav aria-label="Pages des jeux multijoueurs" className="flex justify-center gap-6">{page>1&&<Link href={`/multiplayer?page=${page-1}`}>Précédent</Link>}{page*24<games.total&&<Link href={`/multiplayer?page=${page+1}`}>Suivant</Link>}</nav>

  </div>
}

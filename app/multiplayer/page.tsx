import type { Metadata } from 'next'
import { getGamesCatalog } from '@/lib/queries/games'
import { buildPageMetadata } from '@/lib/seo'
import MultiplayerSection from '@/components/multiplayer/MultiplayerSection'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Jeux multijoueurs gratuits en ligne',
  description: 'Découvre les jeux multijoueurs Chibasko Games et retrouve tes amis pour jouer ensemble depuis ton navigateur.',
  path: '/multiplayer',
})
export default async function MultiplayerPage() {
  const games = await getGamesCatalog('multiplayer_chibasko')
  return <div className="space-y-10 sm:space-y-12">
    <header className="rounded-[28px] border border-cyan-950/80 bg-gradient-to-br from-cyan-950/25 to-zinc-950 px-5 py-7 sm:p-9">
      <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">Chibasko Games</p>
      <h1 className="mt-3 text-3xl font-black uppercase text-white sm:text-4xl">Multijoueur</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-300">Joue avec tes amis sur Chibasko Games.</p>
    </header>
    <MultiplayerSection games={games} />
    <section className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-5 sm:p-7" aria-labelledby="join-title">
      <h2 id="join-title" className="text-xl font-bold text-white">Rejoindre une partie</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Le partage de codes sera disponible à l’ouverture des parties. Pour le moment, découvre les jeux et leurs fiches.</p>
    </section>
  </div>
}

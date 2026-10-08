import Link from 'next/link'
import { GameCard } from '@/components/GameCard'
import type { GameWithCategoriesAndStats } from '@/lib/queries/games'

export default function MultiplayerSection({ games, home = false }: { games: GameWithCategoriesAndStats[]; home?: boolean }) {
  return <section className="space-y-5" aria-labelledby="multiplayer-games-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">À plusieurs sur Chibasko</p>
        <h2 id="multiplayer-games-title" className="mt-2 text-2xl font-black uppercase text-white sm:text-3xl">Jeux multijoueurs</h2>
      </div>
      {home && <Link href="/multiplayer" className="rounded text-sm font-semibold text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300">Voir tous les jeux multijoueurs</Link>}
    </div>
    {games.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {games.map(game => <GameCard key={game.id} game={game} />)}
    </div> : <div className="rounded-[24px] border border-cyan-950 bg-gradient-to-br from-cyan-950/20 to-zinc-950 p-6 sm:p-8">
      <p className="font-semibold text-white">Les premiers jeux multijoueurs Chibasko arrivent bientôt.</p>
      <p className="mt-2 text-sm leading-6 text-zinc-400">En attendant, retrouve tous les jeux classiques dans le catalogue.</p>
      <Link href="/games?type=classic" className="mt-4 inline-block rounded-full border border-cyan-800 px-5 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-950/30 focus-visible:outline-2 focus-visible:outline-cyan-300">Découvrir les jeux classiques</Link>
    </div>}
  </section>
}

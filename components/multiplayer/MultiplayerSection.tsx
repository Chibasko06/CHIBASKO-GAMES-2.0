import Link from 'next/link'
import { GameCard } from '@/components/GameCard'
import collectionStyles from '@/components/GameCardCollection.module.css'
import type { GameWithCategoriesAndStats } from '@/lib/queries/games'
import {hasAvailableMultiplayer,type MultiplayerPresentation} from '@/lib/multiplayer/presentation'

export default function MultiplayerSection({ games, home = false }: { games: (GameWithCategoriesAndStats&MultiplayerPresentation)[]; home?: boolean }) {
  const playable=games.filter(hasAvailableMultiplayer)
  return <section className="space-y-5" aria-labelledby="multiplayer-games-title">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/80">À plusieurs sur Chibasko Games</p>
        <h2 id="multiplayer-games-title" className="mt-2 text-2xl font-black uppercase text-white sm:text-3xl">Jeux multijoueurs</h2>
      </div>
      {home && <Link href="/multiplayer" className="rounded text-sm font-semibold text-cyan-300 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-cyan-300">Voir tous les jeux multijoueurs</Link>}
    </div>
    {playable.length ? <div className={collectionStyles.grid}>
      {playable.map(game => <GameCard key={game.id} game={game} />)}
    </div> : <div className="rounded-[24px] border border-cyan-950 bg-gradient-to-br from-cyan-950/20 to-zinc-950 p-6 sm:p-8">
      <p className="font-semibold text-white">Aucun jeu multijoueur disponible sur cette page.</p>
      <Link href="/games" className="mt-4 inline-block rounded-full border border-cyan-800 px-5 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-950/30 focus-visible:outline-2 focus-visible:outline-cyan-300">Parcourir le catalogue</Link>
    </div>}
  </section>
}

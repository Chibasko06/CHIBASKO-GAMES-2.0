import Image from 'next/image'
import Link from 'next/link'
import { GameBadges, type GameBadgeData } from './GameBadges'
import { getMultiplayerDefinition } from '@/lib/multiplayer/catalogue'
import { gameLaunchOptions } from '@/lib/multiplayer/gameLaunchOptions'

export default function MultiplayerGamePanel({ game }: { game: GameBadgeData & { title: string; slug: string; thumbnail_url: string | null } }) {
  const definition = game.multiplayer_game_id ? getMultiplayerDefinition(game.multiplayer_game_id) : undefined
  const options = gameLaunchOptions(definition?.capabilities)
  return <section aria-label="Modes de jeu" className="overflow-hidden rounded-[24px] border border-cyan-900/50 bg-zinc-950">
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {game.thumbnail_url && <div className="relative min-h-52 md:min-h-80"><Image src={game.thumbnail_url} alt={game.title} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /></div>}
      <div className="space-y-5 p-5 sm:p-8">
        <GameBadges game={game} />
        <h2 className="text-2xl font-black text-white">Retrouve tes amis sur {game.title}</h2>
        {options.map(option => <div key={option.kind} className="space-y-2 border-t border-zinc-800 pt-5">
            <Link href={`/games/${game.slug}/${option.kind === 'public' ? 'online' : option.kind}`} className="inline-flex min-h-12 items-center rounded-xl border border-cyan-700 px-5 py-3 font-bold text-cyan-100 hover:bg-cyan-950 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">{option.label}</Link>
            {option.description && <p className="text-sm text-zinc-400">{option.description}</p>}
          </div>)}
        {!options.length && <p role="status" className="text-sm text-zinc-400">Ce jeu est temporairement indisponible sur Chibasko Games.</p>}
      </div>
    </div>
  </section>
}

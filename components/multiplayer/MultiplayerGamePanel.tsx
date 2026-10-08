import Image from 'next/image'
import { GameBadges, type GameBadgeData } from './GameBadges'
import MultiplayerEntry from './MultiplayerEntry'
import { getMultiplayerDefinition } from '@/lib/multiplayer/catalogue'

export default function MultiplayerGamePanel({ game }: { game: GameBadgeData & { title: string; thumbnail_url: string | null } }) {
  const available = !!game.multiplayer_game_id && !!getMultiplayerDefinition(game.multiplayer_game_id)
  return <section aria-label="Jouer en multijoueur" className="overflow-hidden rounded-[24px] border border-cyan-900/50 bg-zinc-950">
    <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {game.thumbnail_url && <div className="relative min-h-52 md:min-h-80"><Image src={game.thumbnail_url} alt={game.title} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" /></div>}
      <div className="space-y-5 p-5 sm:p-8">
        <GameBadges game={game} />
        <h2 className="text-2xl font-black text-white">Retrouve tes amis sur {game.title}</h2>
        <MultiplayerEntry available={available} />
      </div>
    </div>
  </section>
}

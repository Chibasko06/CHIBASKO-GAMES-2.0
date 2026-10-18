import { multiplayerCapacityLabel } from '@/lib/multiplayer/catalogue'

import type { GameCapabilities } from '@chibaskogames/sdk'
export type GameBadgeData = { runtime_capabilities?: GameCapabilities; game_type?: string; multiplayer_game_id?: string | null; is_beta?: boolean }
export function GameBadges({ game }: { game: GameBadgeData }) {
  const multiplayer = game.game_type === 'multiplayer_chibasko'
  if (!multiplayer && !game.is_beta) return null
  const capabilities = game.runtime_capabilities
  return <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
    {multiplayer && <>
      <span className="rounded-full border border-cyan-800 bg-cyan-950/40 px-3 py-1 text-cyan-200">Multijoueur</span>
      <span className="text-zinc-300">{capabilities?.online ? multiplayerCapacityLabel(capabilities) : 'Indisponible'}</span>
    </>}
    {game.is_beta && <span className="rounded-full border border-amber-800 bg-amber-950/30 px-3 py-1 text-amber-200">Bêta</span>}
  </div>
}

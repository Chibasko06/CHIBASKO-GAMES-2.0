import { multiplayerCapacityLabel } from '@/lib/multiplayer/catalogue'

import {hasAvailableMultiplayer,type MultiplayerPresentation} from '@/lib/multiplayer/presentation'
export type GameBadgeData = MultiplayerPresentation & {is_beta?:boolean}
export function GameBadges({ game }: { game: GameBadgeData }) {
  const multiplayer = hasAvailableMultiplayer(game)
  if (!multiplayer && !game.is_beta) return null
  const capabilities = game.runtime_capabilities??undefined
  return <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
    {multiplayer && <>
      <span className="rounded-full border border-cyan-800 bg-cyan-950/40 px-3 py-1 text-cyan-200">Multijoueur</span>
      <span className="text-zinc-300">{multiplayerCapacityLabel(capabilities)}</span>
    </>}
    {game.is_beta && <span className="rounded-full border border-amber-800 bg-amber-950/30 px-3 py-1 text-amber-200">Bêta</span>}
  </div>
}

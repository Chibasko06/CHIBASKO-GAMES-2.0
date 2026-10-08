import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGameBySlug } from '@/lib/queries/games'
import { isChibaskoMultiplayerGame, getMultiplayerDefinition } from '@/lib/multiplayer/catalogue'
import { normalizeLobbyCode } from '@/lib/lobbyConnection'
import LobbyExperience from '@/components/multiplayer/LobbyExperience'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Partie privée', robots: { index: false, follow: false }, alternates: { canonical: null } }
export default async function LobbyPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code: input } = await params
  let code: string
  try { code = normalizeLobbyCode(input) } catch { notFound() }
  const game = await getGameBySlug(slug)
  if (!game || !isChibaskoMultiplayerGame(game) || !getMultiplayerDefinition(game.multiplayer_game_id)) notFound()
  return <LobbyExperience title={game.title} game={{ slug: game.slug, gameId: game.multiplayer_game_id }} code={code} />
}

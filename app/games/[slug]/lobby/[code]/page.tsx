import DurableLobby from '@/components/multiplayer/DurableLobby'
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
  const game = await getGameBySlug(slug)
  if (game?.active_version_id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) return <DurableLobby gameId={game.id} slug={game.slug} access="public" lobbyId={input} />
  let code: string
  try { code = normalizeLobbyCode(input) } catch { notFound() }
  if (!game || !isChibaskoMultiplayerGame(game) || !getMultiplayerDefinition(game.multiplayer_game_id)) notFound()
  return <LobbyExperience title={game.title} game={{ slug: game.slug, gameId: game.multiplayer_game_id }} code={code} />
}

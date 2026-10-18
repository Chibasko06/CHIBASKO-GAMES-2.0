import DurableLobby from '@/components/multiplayer/DurableLobby'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGameBySlug } from '@/lib/queries/games'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Partie privée', robots: { index: false, follow: false }, alternates: { canonical: null } }
export default async function LobbyPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code: input } = await params
  const game = await getGameBySlug(slug)
  if (!game?.active_version_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) notFound()
  return <DurableLobby gameId={game.id} slug={game.slug} access="public" lobbyId={input} />
}

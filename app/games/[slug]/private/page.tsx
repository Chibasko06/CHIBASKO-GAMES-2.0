import DurableLobby from '@/components/multiplayer/DurableLobby'
import type { Metadata } from 'next'
import Link from 'next/link'
import { onlineGamePage } from '@/lib/server/onlineGamePage'
import MultiplayerEntry from '@/components/multiplayer/MultiplayerEntry'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Partie privée | Chibasko Games', robots: { index: false, follow: false } }
export default async function PrivateGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const game = await onlineGamePage(slug, 'private')
  return <section className="mx-auto max-w-3xl space-y-6">
    <Link href={`/games/${game.slug}`} className="rounded text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-300">← Retour à la fiche</Link>
    <header className="space-y-2"><p className="text-sm text-cyan-300">Partie privée · Chibasko Games</p><h1 className="break-words text-3xl font-black">{game.title}</h1><p className="text-zinc-400">Crée une partie privée ou rejoins-en une avec un code.</p></header>
    {game.active_version_id ? <DurableLobby gameId={game.id} slug={game.slug} access="private" /> : <MultiplayerEntry expanded game={{ slug: game.slug, gameId: game.multiplayer_game_id! }} returnPath={`/games/${game.slug}/private`} />}
  </section>
}

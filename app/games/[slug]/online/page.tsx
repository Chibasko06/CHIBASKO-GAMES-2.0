import type { Metadata } from 'next'
import Link from 'next/link'
import { onlineGamePage } from '@/lib/server/onlineGamePage'
import PublicLobbyBrowser from '@/components/multiplayer/PublicLobbyBrowser'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Salons publics | Chibasko Games', robots: { index: false, follow: false } }
export default async function OnlineGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const game = await onlineGamePage(slug, 'public')
  return <section className="mx-auto max-w-3xl space-y-6">
    <Link href={`/games/${game.slug}`} className="rounded text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-300">← Retour à la fiche</Link>
    <header className="space-y-2"><p className="text-sm text-cyan-300">Salons publics · Chibasko Games</p><h1 className="break-words text-3xl font-black">{game.title}</h1><p className="text-zinc-400">Rejoins un salon public ou crée le tien.</p></header>
    <PublicLobbyBrowser game={{ slug: game.slug, gameId: game.multiplayer_game_id }} />
  </section>
}

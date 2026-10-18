import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGameBySlug } from '@/lib/queries/games'
import ArtifactLocalGame from '@/components/game-runtime/ArtifactLocalGame'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Partie locale | Chibasko Games', robots: { index: false, follow: false } }
export default async function LocalGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game || !game.active_version_id || !game.runtime_capabilities?.local) notFound()
  return <div className="mx-auto min-w-0 max-w-5xl space-y-5">
    <Link href={'/games/' + game.slug} className="inline-block rounded-lg text-sm text-cyan-300 focus-visible:outline-2 focus-visible:outline-cyan-300">← Retour à la fiche de {game.title}</Link>
    <p className="text-sm text-zinc-400">Partie locale · Sur le même appareil · Sans compte</p>
    <ArtifactLocalGame gameId={game.id} versionId={game.active_version_id} slug={game.slug} />
  </div>
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGameBySlug } from '@/lib/queries/games'
import ArtifactLocalGame from '@/components/game-runtime/ArtifactLocalGame'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Partie locale | Chibasko Games', robots: { index: false, follow: false } }
export default async function LocalGamePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game || !game.active_version_id || !game.runtime_capabilities?.local) notFound()
  return <div className="min-w-0 space-y-2">
    <h1 className="text-sm font-semibold text-zinc-300">{game.title} <span className="font-normal text-zinc-500">· Partie locale</span></h1>
    <ArtifactLocalGame gameId={game.id} versionId={game.active_version_id} slug={game.slug} title={game.title} coverUrl={game.thumbnail_url} local={game.runtime_capabilities.local} initialLikes={game.likes_count} initialDislikes={game.dislikes_count} />
  </div>
}

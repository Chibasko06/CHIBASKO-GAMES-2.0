import {cache} from 'react'
import GamePagePlayerLayout from '@/components/GamePagePlayerLayout'
import {selectGameRecommendations} from '@/lib/catalogueRecommendations'
import ArtifactGamePlayer from '@/components/game-runtime/ArtifactGamePlayer'
import { isClassicGame } from '@/lib/multiplayer/catalogue'
import { catalogueSource } from '@/lib/catalogueSource'
import type { Metadata } from 'next'
import GameReviews from '@/components/GameReviews'
import GameViewport from '@/components/GameViewport'
import PlaySessionTracker from '@/components/PlaySessionTracker'
import { getGameBySlug, getGameRecommendations } from '@/lib/queries/games'
import { serializeJsonLd } from '@/lib/seo'
import { gameMetadata, gameStructuredData } from '@/lib/seoCatalogue'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { publishedOnlineAccess } from '@/lib/server/publishedOnlineAccess'

const getGame=cache(getGameBySlug)
export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const game=await getGame(slug)

  if (!game) {
    return {
      title: 'Jeu introuvable',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  return gameMetadata(game)
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const game=await getGame(slug)

  if (!game) {
    notFound()
  }

  const availableAccess=game.active_version_id && game.runtime_capabilities?.online
    ? await Promise.all(game.runtime_capabilities.online.access.map(async access=>{
      try{return await publishedOnlineAccess(game.id,game.active_version_id!,access) ? access : null}
      catch{console.error(JSON.stringify({event:'game_availability_failed',gameId:game.id,code:'availability_unavailable'}));return null}
    }))
    : []

  const structuredData = gameStructuredData(game)

  return (
    <div className="space-y-6 xl:space-y-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <PlaySessionTracker gameId={game.id} recordPlay={isClassicGame(game)} />
      <nav aria-label="Fil d’Ariane" className="flex flex-wrap gap-2 text-sm text-zinc-400">
        <Link href="/">Accueil</Link><span aria-hidden="true">/</span><Link href="/games">Jeux</Link><span aria-hidden="true">/</span><span aria-current="page">{game.title}</span>
      </nav>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <h1 className="text-3xl font-black uppercase text-cyan-400 sm:text-4xl">{game.title}</h1>
          {game.developer_name && <p className="text-sm text-zinc-400">{game.developer_name}</p>}
          <div className="flex flex-wrap gap-2">
            {game.categories?.map((category) => (
              <Link
                key={category.id}
                href={`/games?category=${category.slug}`}
                className="text-[10px] uppercase tracking-[0.3em] px-3 py-1 border border-zinc-700 text-zinc-400"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>


      </div>

      <GamePagePlayerLayout recommendations={selectGameRecommendations(game,await getGameRecommendations(game))} primaryCategoryId={game.categories[0]?.id}>
      {!game.active_version_id && isClassicGame(game) ? (
        <GameViewport title={game.title} developerName={game.developer_name} coverUrl={game.thumbnail_url} gameId={game.id} gameUrl={game.game_url} initialLikes={game.likes_count} initialDislikes={game.dislikes_count} />
      ) : (
        <ArtifactGamePlayer
          key={game.id+':'+game.active_version_id}
          gameId={game.id}
          versionId={game.active_version_id??null}
          slug={game.slug}
          title={game.title}
          developerName={game.developer_name}
          coverUrl={game.thumbnail_url}
          capabilities={game.runtime_capabilities}
          availableAccess={availableAccess.filter(access=>access!==null)}
          initialLikes={game.likes_count}
          initialDislikes={game.dislikes_count}
        />
      )}

      </GamePagePlayerLayout>

      <p className="text-zinc-400">
        {game.description ?? 'Aucune description disponible.'}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Developpeur</p>
          <p className="text-base font-bold text-white">{game.developer_name || 'Non renseigne'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Sortie</p>
          <p className="text-base font-bold text-white">{game.release_date_text || 'Non renseignee'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Mobile</p>
          <p className="text-base font-bold text-white">{game.mobile_compatible || 'Non renseigne'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Technologie</p>
          <p className="text-base font-bold text-white">{game.technology || 'Non renseignee'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">{catalogueSource(game).label}</p>
          <p className="text-base font-bold text-white">{catalogueSource(game).value}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Communaute</p>
          <p className="text-base font-bold text-white">
            {game.favorites_count} favoris • {game.ratings_count} notes • {game.comments_count} commentaires
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[20px] border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Vues</p>
          <p className="mt-2 text-2xl font-black text-white">{game.views_count}</p>
        </div>
        <div className="rounded-[20px] border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Likes</p>
          <p className="mt-2 text-2xl font-black text-white">{game.likes_count}</p>
        </div>
        <div className="rounded-[20px] border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Dislikes</p>
          <p className="mt-2 text-2xl font-black text-white">{game.dislikes_count}</p>
        </div>
        <div className="rounded-[20px] border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Note moyenne</p>
          <p className="mt-2 text-2xl font-black text-white">{game.average_rating.toFixed(1)} / 5</p>
        </div>
      </div>

      <GameReviews gameId={game.id} />
    </div>
  )
}

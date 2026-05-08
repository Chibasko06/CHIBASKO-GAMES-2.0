import type { Metadata } from 'next'
import FavoriteButton from '@/components/FavoriteButton'
import GameReviews from '@/components/GameReviews'
import GameViewport from '@/components/GameViewport'
import PlaySessionTracker from '@/components/PlaySessionTracker'
import { getGameBySlug } from '@/lib/queries/games'
import { absoluteUrl } from '@/lib/seo'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const game = await getGameBySlug(slug)

  if (!game) {
    return {
      title: 'Jeu introuvable',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const description =
    game.description ||
    `Joue a ${game.title} sur Chibasko Games, gratuitement depuis ton navigateur.`

  return {
    title: game.title,
    description,
    alternates: {
      canonical: `https://chibaskogames.fr/games/${game.slug}`,
    },
    openGraph: {
      title: game.title,
      description,
      url: `https://chibaskogames.fr/games/${game.slug}`,
      type: 'article',
      images: game.thumbnail_url ? [{ url: game.thumbnail_url }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: game.title,
      description,
      images: game.thumbnail_url ? [game.thumbnail_url] : undefined,
    },
  }
}

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const game = await getGameBySlug(slug)

  if (!game) {
    notFound()
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: game.title,
    description: game.description || `Joue a ${game.title} sur Chibasko Games.`,
    url: absoluteUrl(`/games/${game.slug}`),
    image: game.thumbnail_url || absoluteUrl('/logo-chibaskogames-rond.ico'),
    genre: game.categories?.map((category) => category.name),
    author: game.developer_name
      ? {
          '@type': 'Organization',
          name: game.developer_name,
        }
      : undefined,
    publisher: {
      '@type': 'Organization',
      name: 'Chibasko Games',
      url: absoluteUrl('/'),
    },
    aggregateRating: game.ratings_count > 0
      ? {
          '@type': 'AggregateRating',
          ratingValue: Number(game.average_rating.toFixed(1)),
          ratingCount: game.ratings_count,
          bestRating: 5,
          worstRating: 1,
        }
      : undefined,
  }

  return (
    <div className="space-y-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PlaySessionTracker gameId={game.id} />

      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <h1 className="text-3xl font-black uppercase text-cyan-400">{game.title}</h1>
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

        <FavoriteButton gameId={game.id} />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
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

      <GameViewport
        gameId={game.id}
        gameUrl={game.game_url}
        initialLikes={game.likes_count}
        initialDislikes={game.dislikes_count}
      />

      <p className="text-zinc-400">
        {game.description ?? 'Aucune description disponible.'}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Provider</p>
          <p className="text-base font-bold text-white">{game.provider_name || 'Non renseigne'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Communaute</p>
          <p className="text-base font-bold text-white">
            {game.favorites_count} favoris • {game.ratings_count} notes • {game.comments_count} commentaires
          </p>
        </div>
      </div>

      <GameReviews gameId={game.id} />
    </div>
  )
}

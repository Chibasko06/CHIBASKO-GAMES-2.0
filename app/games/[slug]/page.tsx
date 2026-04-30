import FavoriteButton from '@/components/FavoriteButton'
import GameReviews from '@/components/GameReviews'
import PlaySessionTracker from '@/components/PlaySessionTracker'
import { getGameBySlug } from '@/lib/queries/games'
import Link from 'next/link'
import { notFound } from 'next/navigation'

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

  return (
    <div className="space-y-6">
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
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Favoris</p>
          <p className="mt-2 text-2xl font-black text-white">{game.favorites_count}</p>
        </div>
        <div className="rounded-[20px] border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Note moyenne</p>
          <p className="mt-2 text-2xl font-black text-white">{game.average_rating.toFixed(1)} / 5</p>
        </div>
        <div className="rounded-[20px] border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Commentaires</p>
          <p className="mt-2 text-2xl font-black text-white">{game.comments_count}</p>
        </div>
      </div>

      <div className="aspect-video overflow-hidden rounded-[24px] border border-cyan-900/50 bg-black">
        <iframe
          src={game.game_url}
          className="h-full w-full"
          allowFullScreen
        />
      </div>

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
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Stats gameplay</p>
          <p className="text-base font-bold text-white">
            {game.play_count} parties • {game.ratings_count} notes
          </p>
        </div>
      </div>

      <GameReviews gameId={game.id} />
    </div>
  )
}

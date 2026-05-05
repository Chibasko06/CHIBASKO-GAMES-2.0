import Link from 'next/link'

type Props = {
  game: {
    id: string
    title: string
    slug: string
    thumbnail_url: string | null
    categories?: { id: string; name: string; slug: string }[]
    description?: string | null
    views_count?: number
    likes_count?: number
    dislikes_count?: number
    developer_name?: string | null
    technology?: string | null
  }
}

export function GameCard({ game }: Props) {
  return (
    <Link href={`/games/${game.slug}`} className="block">
      <article className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 hover:border-cyan-700 hover:scale-[1.02] transition cursor-pointer">
        {game.thumbnail_url ? (
          <img
            src={game.thumbnail_url}
            alt={game.title}
            className="w-full h-40 object-cover"
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black flex items-center justify-center text-3xl">
            <span aria-hidden="true">🎮</span>
          </div>
        )}

        <div className="p-3 space-y-2">
          <h3 className="text-sm font-semibold line-clamp-1">{game.title}</h3>
          {game.categories?.length ? (
            <div className="flex flex-wrap gap-1">
              {game.categories.slice(0, 2).map((category) => (
                <span
                  key={category.id}
                  className="border border-zinc-700 px-2 py-1 text-[9px] uppercase tracking-[0.2em] text-cyan-300"
                >
                  {category.name}
                </span>
              ))}
            </div>
          ) : null}
          {game.description ? (
            <p className="text-xs text-zinc-400 line-clamp-2">{game.description}</p>
          ) : null}
          <div className="space-y-1 text-[10px] uppercase text-zinc-500">
            <div className="flex items-center tracking-[0.2em] gap-3">
              <span>{game.views_count ?? 0} vues</span>
              <span>{game.likes_count ?? 0} likes</span>
            </div>
            {game.developer_name || game.technology ? (
              <div className="flex items-center gap-2">
                {game.developer_name ? <span>{game.developer_name}</span> : null}
                {game.technology ? <span>{game.technology}</span> : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  )
}

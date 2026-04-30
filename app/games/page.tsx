import GamesCatalog from '@/components/GamesCatalog'
import { getCategories, getGamesCatalog } from '@/lib/queries/games'

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const [games, categories] = await Promise.all([
    getGamesCatalog(),
    getCategories(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Tous les jeux</h1>
        <p className="text-zinc-500 mb-6">
          Bibliotheque complete des jeux publies actuellement sur Chibasko Games, avec recherche, filtres et tri.
        </p>
      </div>

      <GamesCatalog games={games} categories={categories} initialCategorySlug={category} />
    </div>
  )
}

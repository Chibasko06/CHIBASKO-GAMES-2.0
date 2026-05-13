import type { Metadata } from 'next'
import GamesCatalog from '@/components/GamesCatalog'
import { getCategories, getGamesCatalog } from '@/lib/queries/games'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Catalogue de jeux gratuits en ligne',
  description:
    'Parcours le catalogue de jeux gratuits de Chibasko Games avec recherche, categories, tri et filtres pour trouver ton prochain jeu navigateur.',
  path: '/games',
})

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
    <div className="space-y-6 2xl:space-y-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold sm:text-3xl">Tous les jeux</h1>
        <p className="mb-6 max-w-3xl text-zinc-500">
          Explore le catalogue complet des jeux gratuits publies sur Chibasko Games. Recherche, filtres et tri t aident a trouver rapidement le bon jeu navigateur selon ton envie du moment.
        </p>
      </div>

      <GamesCatalog games={games} categories={categories} initialCategorySlug={category} />
    </div>
  )
}

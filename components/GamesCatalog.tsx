"use client";

import { useDeferredValue, useState } from 'react'
import { GameCard } from '@/components/GameCard'
import type { Category, GameWithCategories } from '@/lib/queries/games'

type SortOption = 'popular' | 'recent' | 'title-asc' | 'title-desc'

type Props = {
  games: GameWithCategories[]
  categories: Category[]
  initialCategorySlug?: string
}

export default function GamesCatalog({
  games,
  categories,
  initialCategorySlug,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(initialCategorySlug || 'all')
  const [sort, setSort] = useState<SortOption>('popular')
  const deferredSearch = useDeferredValue(search)

  const normalizedQuery = deferredSearch.trim().toLowerCase()

  const visibleGames = games
    .filter((game) => {
      const matchesCategory =
        selectedCategory === 'all' ||
        game.categories.some((category) => category.slug === selectedCategory)

      if (!matchesCategory) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const haystack = [
        game.title,
        game.description,
        game.developer_name,
        game.technology,
        ...game.categories.map((category) => category.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return haystack.includes(normalizedQuery)
    })
    .sort((left, right) => {
      if (sort === 'recent') {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      }

      if (sort === 'title-asc') {
        return left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' })
      }

      if (sort === 'title-desc') {
        return right.title.localeCompare(left.title, 'fr', { sensitivity: 'base' })
      }

      if ((right.play_count ?? 0) !== (left.play_count ?? 0)) {
        return (right.play_count ?? 0) - (left.play_count ?? 0)
      }

      return (right.views_count ?? 0) - (left.views_count ?? 0)
    })

  return (
    <div className="space-y-6">
      <section className="border border-zinc-800 bg-zinc-950 p-4 md:p-6 space-y-5">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_220px] gap-4">
          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500 mb-2 block">
              Recherche
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Titre, categorie, studio, techno..."
              className="w-full bg-black border border-zinc-800 px-4 py-3 text-white outline-none focus:border-cyan-500"
            />
          </label>

          <label className="block">
            <span className="text-[10px] uppercase tracking-[0.35em] text-zinc-500 mb-2 block">
              Tri
            </span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              className="w-full bg-black border border-zinc-800 px-4 py-3 text-white outline-none focus:border-cyan-500"
            >
              <option value="popular">Popularite</option>
              <option value="recent">Plus recents</option>
              <option value="title-asc">A à Z</option>
              <option value="title-desc">Z à A</option>
            </select>
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">
              Categories
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory('all')
                setSearch('')
                setSort('popular')
              }}
              className="text-xs text-zinc-400 hover:text-cyan-400 transition-colors"
            >
              Reinitialiser
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-2 text-xs uppercase tracking-[0.2em] border transition-colors ${
                selectedCategory === 'all'
                  ? 'border-cyan-500 bg-cyan-500 text-black'
                  : 'border-zinc-800 text-zinc-300 hover:border-cyan-700'
              }`}
            >
              Toutes
            </button>
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategory(category.slug)}
                className={`px-3 py-2 text-xs uppercase tracking-[0.2em] border transition-colors ${
                  selectedCategory === category.slug
                    ? 'border-cyan-500 bg-cyan-500 text-black'
                    : 'border-zinc-800 text-zinc-300 hover:border-cyan-700'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
          <span>
            {visibleGames.length} jeu{visibleGames.length > 1 ? 'x' : ''} affiche{visibleGames.length > 1 ? 's' : ''}
          </span>
          {selectedCategory !== 'all' ? (
            <span className="border border-cyan-900 px-2 py-1 text-cyan-300 text-xs uppercase tracking-[0.2em]">
              {categories.find((category) => category.slug === selectedCategory)?.name ?? selectedCategory}
            </span>
          ) : null}
          {deferredSearch.trim() ? (
            <span className="border border-zinc-800 px-2 py-1 text-zinc-300 text-xs">
              {deferredSearch.trim()}
            </span>
          ) : null}
        </div>
      </section>

      {visibleGames.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-400">
          Aucun jeu ne correspond aux filtres actuels.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {visibleGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  )
}

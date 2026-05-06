"use client";

import { useDeferredValue, useState } from 'react'
import { GameCard } from '@/components/GameCard'
import type { Category, GameWithCategoriesAndStats } from '@/lib/queries/games'

type SortOption = 'popular' | 'recent' | 'title-asc' | 'title-desc'
type DeviceFilter = 'all' | 'mobile' | 'desktop'

type Props = {
  games: GameWithCategoriesAndStats[]
  categories: Category[]
  initialCategorySlug?: string
}

function normalizeCompatibility(value: string | null | undefined) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function getCompatibilityBucket(value: string | null | undefined): DeviceFilter | 'unknown' {
  const normalized = normalizeCompatibility(value)

  if (!normalized) {
    return 'unknown'
  }

  const mobilePatterns = ['yes', 'oui', 'true', 'mobile', 'smartphone', 'touch', 'tactile', 'compatible']
  const desktopPatterns = ['no', 'non', 'false', 'pc', 'desktop', 'ordinateur', 'clavier', 'souris']

  const mobileScore = mobilePatterns.filter((pattern) => normalized.includes(pattern)).length
  const desktopScore = desktopPatterns.filter((pattern) => normalized.includes(pattern)).length

  if (desktopScore > mobileScore) {
    return 'desktop'
  }

  if (mobileScore > desktopScore) {
    return 'mobile'
  }

  return 'unknown'
}

export default function GamesCatalog({
  games,
  categories,
  initialCategorySlug,
}: Props) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(initialCategorySlug || 'all')
  const [sort, setSort] = useState<SortOption>('popular')
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all')
  const deferredSearch = useDeferredValue(search)

  const normalizedQuery = deferredSearch.trim().toLowerCase()

  const visibleGames = games
    .filter((game) => {
      const compatibilityBucket = getCompatibilityBucket(game.mobile_compatible)
      const matchesCategory =
        selectedCategory === 'all' ||
        game.categories.some((category) => category.slug === selectedCategory)

      if (!matchesCategory) {
        return false
      }

      const matchesDeviceFilter =
        deviceFilter === 'all' ||
        compatibilityBucket === deviceFilter

      if (!matchesDeviceFilter) {
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

      if ((right.views_count ?? 0) !== (left.views_count ?? 0)) {
        return (right.views_count ?? 0) - (left.views_count ?? 0)
      }

      return (right.likes_count ?? 0) - (left.likes_count ?? 0)
    })

  return (
    <div className="space-y-6">
      <section className="space-y-5 border border-zinc-800 bg-zinc-950 p-4 md:p-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_220px_220px]">
          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.35em] text-zinc-500">
              Recherche
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Titre, categorie, studio, techno..."
              className="w-full border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-cyan-500"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.35em] text-zinc-500">
              Tri
            </span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              className="w-full border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-cyan-500"
            >
              <option value="popular">Popularite</option>
              <option value="recent">Plus recents</option>
              <option value="title-asc">A a Z</option>
              <option value="title-desc">Z a A</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[10px] uppercase tracking-[0.35em] text-zinc-500">
              Compatibilite
            </span>
            <select
              value={deviceFilter}
              onChange={(event) => setDeviceFilter(event.target.value as DeviceFilter)}
              className="w-full border border-zinc-800 bg-black px-4 py-3 text-white outline-none focus:border-cyan-500"
            >
              <option value="all">Toutes</option>
              <option value="mobile">Mobile compatible</option>
              <option value="desktop">PC uniquement</option>
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
                setDeviceFilter('all')
              }}
              className="text-xs text-zinc-400 transition-colors hover:text-cyan-400"
            >
              Reinitialiser
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`border px-3 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
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
                className={`border px-3 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
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
            <span className="border border-cyan-900 px-2 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">
              {categories.find((category) => category.slug === selectedCategory)?.name ?? selectedCategory}
            </span>
          ) : null}
          {deviceFilter !== 'all' ? (
            <span className="border border-zinc-800 px-2 py-1 text-xs uppercase tracking-[0.2em] text-zinc-300">
              {deviceFilter === 'mobile' ? 'Mobile compatible' : 'PC uniquement'}
            </span>
          ) : null}
          {deferredSearch.trim() ? (
            <span className="border border-zinc-800 px-2 py-1 text-xs text-zinc-300">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {visibleGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  )
}

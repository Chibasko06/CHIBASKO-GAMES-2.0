import { Tables } from '@/types/database'
import { supabase } from '../supabaseClient'

export type Game = Tables<'games'>
export type Category = Tables<'categories'>
export type GameReview = Tables<'game_reviews'>

type GameCategoryRow = {
  game_id?: string
  categories: Category | null
}

export type GamePublicStat = {
  game_id: string
  favorites_count: number
  ratings_count: number
  average_rating: number
  comments_count: number
}

export type GameWithCategories = Game & {
  categories: Category[]
}

export type GameWithCategoriesAndStats = GameWithCategories & {
  favorites_count: number
  ratings_count: number
  average_rating: number
  comments_count: number
}

export type HomepageHighlight = {
  label: string
  description: string
  game: GameWithCategoriesAndStats
}

function withFallbackThumbnail(game: Game): Game {
  return {
    ...game,
    thumbnail_url: game.thumbnail_url || null,
  }
}

export async function getCategories() {
  const { data } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true })

  return data ?? []
}

export async function getGamePublicStats() {
  const { data } = await supabase.rpc('get_game_public_stats')

  return ((data as GamePublicStat[] | null) ?? []).map((row) => ({
    ...row,
    favorites_count: Number(row.favorites_count ?? 0),
    ratings_count: Number(row.ratings_count ?? 0),
    average_rating: Number(row.average_rating ?? 0),
    comments_count: Number(row.comments_count ?? 0),
  }))
}

function mergeGamesWithStats(
  games: GameWithCategories[],
  stats: GamePublicStat[]
): GameWithCategoriesAndStats[] {
  const statsByGameId = new Map(stats.map((row) => [row.game_id, row]))

  return games.map((game) => {
    const gameStat = statsByGameId.get(game.id)

    return {
      ...game,
      favorites_count: gameStat?.favorites_count ?? 0,
      ratings_count: gameStat?.ratings_count ?? 0,
      average_rating: gameStat?.average_rating ?? 0,
      comments_count: gameStat?.comments_count ?? 0,
    }
  })
}

export async function getGamesCatalog() {
  const [{ data: games }, { data: categoryLinks }] = await Promise.all([
    supabase
      .from('games')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('game_categories')
      .select('game_id, categories(*)'),
  ])

  const categoriesByGameId = new Map<string, Category[]>()

  for (const link of (categoryLinks as GameCategoryRow[] | null) ?? []) {
    if (!link.game_id || !link.categories) {
      continue
    }

    const current = categoriesByGameId.get(link.game_id) ?? []
    current.push(link.categories)
    categoriesByGameId.set(link.game_id, current)
  }

  return (games ?? []).map((game) => ({
    ...withFallbackThumbnail(game),
    categories: categoriesByGameId.get(game.id) ?? [],
  }))
}

export async function getGames() {
  const [games, stats] = await Promise.all([
    getGamesCatalog(),
    getGamePublicStats(),
  ])

  return mergeGamesWithStats(games, stats).sort((left, right) => {
    if ((right.play_count ?? 0) !== (left.play_count ?? 0)) {
      return (right.play_count ?? 0) - (left.play_count ?? 0)
    }

    return (right.views_count ?? 0) - (left.views_count ?? 0)
  })
}

export async function getFeaturedGames(limit = 4) {
  const games = await getGames()
  return games.slice(0, limit)
}

export async function getHomepageHighlights() {
  const games = await getGames()

  if (!games.length) {
    return []
  }

  const mostViewed = [...games].sort((left, right) => (right.views_count ?? 0) - (left.views_count ?? 0))[0]
  const mostFavorited = [...games].sort((left, right) => right.favorites_count - left.favorites_count)[0]
  const bestRated = [...games]
    .filter((game) => game.ratings_count > 0)
    .sort((left, right) => {
      if (right.average_rating !== left.average_rating) {
        return right.average_rating - left.average_rating
      }

      return right.ratings_count - left.ratings_count
    })[0] ?? mostViewed

  const usedIds = new Set([mostViewed.id, mostFavorited.id, bestRated.id])
  const randomPool = games.filter((game) => !usedIds.has(game.id))
  const teamPick =
    randomPool[Math.floor(Math.random() * randomPool.length)] ??
    games[Math.floor(Math.random() * games.length)]

  return [
    {
      label: 'Le plus vu',
      description: `${mostViewed.views_count} vues`,
      game: mostViewed,
    },
    {
      label: 'Le plus en favori',
      description: `${mostFavorited.favorites_count} favoris`,
      game: mostFavorited,
    },
    {
      label: 'Meilleure note',
      description: `${bestRated.average_rating.toFixed(1)} / 5`,
      game: bestRated,
    },
    {
      label: 'Selection equipe',
      description: 'Choix surprise du moment',
      game: teamPick,
    },
  ] satisfies HomepageHighlight[]
}

export async function getGamesByCategory(limitPerCategory = 4) {
  const [categories, games] = await Promise.all([
    getCategories(),
    getGames(),
  ])

  if (!categories.length) {
    return []
  }

  return categories
    .map((category) => ({
      category,
      games: games
        .filter((game) => game.categories.some((gameCategory) => gameCategory.id === category.id))
        .slice(0, limitPerCategory),
    }))
    .filter((section) => section.games.length > 0)
}

export async function getGameBySlug(slug: string) {
  const [games, stats] = await Promise.all([
    getGamesCatalog(),
    getGamePublicStats(),
  ])

  const game = games.find((entry) => entry.slug === slug)

  if (!game) {
    return null
  }

  return mergeGamesWithStats([game], stats)[0]
}

export async function getGameReviews(gameId: string) {
  const { data } = await supabase.rpc('get_game_reviews', {
    p_game_id: gameId,
  })

  return (data as Array<{
    id: string
    user_id: string
    username: string
    avatar_url: string | null
    rating: number
    comment: string
    created_at: string
    updated_at: string
  }> | null) ?? []
}

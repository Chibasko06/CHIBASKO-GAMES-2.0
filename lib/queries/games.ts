import { Tables } from '@/types/database'
import { supabase } from '../supabaseClient'

export type Game = Tables<'games'>
export type Category = Tables<'categories'>

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
  likes_count: number
  dislikes_count: number
}

export type GameWithCategories = Game & {
  categories: Category[]
}

export type GameWithCategoriesAndStats = GameWithCategories & GamePublicStat

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
    likes_count: Number(row.likes_count ?? 0),
    dislikes_count: Number(row.dislikes_count ?? 0),
  }))
}

function mergeGamesWithStats(
  games: GameWithCategories[],
  stats: GamePublicStat[]
): GameWithCategoriesAndStats[] {
  const statsByGameId = new Map(stats.map((row) => [row.game_id, row]))

  return games.map((game) => {
    const stat = statsByGameId.get(game.id)

    return {
      ...game,
      game_id: game.id,
      favorites_count: stat?.favorites_count ?? 0,
      ratings_count: stat?.ratings_count ?? 0,
      average_rating: stat?.average_rating ?? 0,
      comments_count: stat?.comments_count ?? 0,
      likes_count: stat?.likes_count ?? 0,
      dislikes_count: stat?.dislikes_count ?? 0,
    }
  })
}

export async function getGamesCatalog() {
  const [{ data: games }, { data: categoryLinks }, stats] = await Promise.all([
    supabase
      .from('games')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('game_categories')
      .select('game_id, categories(*)'),
    getGamePublicStats(),
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

  const catalog = (games ?? []).map((game) => ({
    ...withFallbackThumbnail(game),
    categories: categoriesByGameId.get(game.id) ?? [],
  }))

  return mergeGamesWithStats(catalog, stats)
}

export async function getGames() {
  const games = await getGamesCatalog()

  return games.sort((left, right) => {
    if ((right.views_count ?? 0) !== (left.views_count ?? 0)) {
      return (right.views_count ?? 0) - (left.views_count ?? 0)
    }

    if (right.likes_count !== left.likes_count) {
      return right.likes_count - left.likes_count
    }

    return right.average_rating - left.average_rating
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
  const teamPickPool = games.filter((game) => ![mostViewed.id, mostFavorited.id, bestRated.id].includes(game.id))
  const teamPick =
    teamPickPool[Math.floor(Math.random() * Math.max(teamPickPool.length, 1))] ?? mostViewed

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
      description: 'Choix du moment',
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
  const games = await getGamesCatalog()

  const game = games.find((entry) => entry.slug === slug)

  if (!game) {
    return null
  }

  return game
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

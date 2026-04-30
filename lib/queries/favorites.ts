import { Tables } from '@/types/database'
import { supabase } from '../supabaseClient'

type Game = Tables<'games'>

type FavoriteGameRow = {
  id: string
  created_at: string
  games: Game | null
}

export async function addFavorite(userId: string, gameId: string) {
  return await supabase.from('favorites').insert({
    user_id: userId,
    game_id: gameId,
  })
}

export async function removeFavorite(userId: string, gameId: string) {
  return await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('game_id', gameId)
}

export async function getFavoriteGames(userId: string) {
  const { data } = await supabase
    .from('favorites')
    .select('id, created_at, games(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  return (data as FavoriteGameRow[] | null)?.flatMap((row) =>
    row.games
      ? [
          {
            favoriteId: row.id,
            created_at: row.created_at,
            game: row.games,
          },
        ]
      : []
  ) ?? []
}

export async function isFavorite(userId: string, gameId: string) {
  const { data } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .maybeSingle()

  return Boolean(data)
}

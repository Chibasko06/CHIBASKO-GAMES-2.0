import {readData} from '@/lib/dataAccess'
import { Tables } from '@/types/database'
import { supabase } from '../supabaseClient'
import {readAllRows} from '../pagination'

type Game = Tables<'games'>

type FavoriteGameRow = {
  id: string
  created_at: string
  games: Game | null
}

export async function addFavorite(userId: string, gameId: string) {
  return await readData('favorite_add', supabase.from('favorites').insert({
    user_id: userId,
    game_id: gameId,
  }))
}

export async function removeFavorite(userId: string, gameId: string) {
  return await readData('favorite_remove', supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('game_id', gameId))
}

export async function getFavoriteGames(userId: string) {
  const data = await readAllRows<FavoriteGameRow>('favorite_games',(from,to)=>supabase
    .from('favorites')
    .select('id, created_at, games(*)',{count:'exact'})
    .eq('user_id', userId)
    .order('created_at', { ascending: false }).order('id').range(from,to))

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

export async function getFavoriteGamesPage(userId:string,page=1){
 const {data,count}=await readData('favorite_games_page',supabase.from('favorites').select('id, created_at, games!inner(*)',{count:'exact'}).eq('user_id',userId).order('created_at',{ascending:false}).order('id').range((page-1)*24,page*24-1))
 if(count===null)throw new Error('favorite_count_unavailable')
 const entries=((data??[]) as FavoriteGameRow[]).flatMap(row=>row.games?[{favoriteId:row.id,created_at:row.created_at,game:row.games}]:[])
 return {items:entries.map(entry=>entry.game),entries,total:count}
}

export async function isFavorite(userId: string, gameId: string) {
  const { data } = await readData('favorite_lookup', supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .maybeSingle())

  return Boolean(data)
}

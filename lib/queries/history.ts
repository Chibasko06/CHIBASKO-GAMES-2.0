import { Tables } from '@/types/database'
import { supabase } from '../supabaseClient'

type Game = Tables<'games'>

type PlayHistoryRow = {
  id: string
  played_at: string
  games: Game | null
}

export async function getRecentPlayHistory(userId: string, limit = 5) {
  const { data } = await supabase
    .from('play_history')
    .select('id, played_at, games(*)')
    .eq('user_id', userId)
    .order('played_at', { ascending: false })
    .limit(limit * 4)

  const uniqueByGame = new Map<string, {
    historyId: string
    played_at: string
    game: Game
  }>()

  for (const row of (data as PlayHistoryRow[] | null) ?? []) {
    if (!row.games || uniqueByGame.has(row.games.id)) {
      continue
    }

    uniqueByGame.set(row.games.id, {
      historyId: row.id,
      played_at: row.played_at,
      game: row.games,
    })

    if (uniqueByGame.size >= limit) {
      break
    }
  }

  return Array.from(uniqueByGame.values())
}

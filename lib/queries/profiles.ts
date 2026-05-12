import { Tables } from '@/types/database'
import { supabase } from '@/lib/supabaseClient'

type Profile = Tables<'profiles'>

export type PublicProfile = Pick<
  Profile,
  'id' | 'username' | 'avatar_url' | 'bio' | 'xp_points' | 'created_at'
>

export async function getPublicProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, xp_points, created_at')
    .order('xp_points', { ascending: false })
    .order('username', { ascending: true })

  if (error) {
    return []
  }

  return (data as PublicProfile[] | null) ?? []
}

export async function getPublicProfileByUsername(username: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, xp_points, created_at')
    .eq('username', username)
    .maybeSingle()

  if (error) {
    return null
  }

  return (data as PublicProfile | null) ?? null
}

export async function getPublicProfileById(id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, xp_points, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    return null
  }

  return (data as PublicProfile | null) ?? null
}

export async function getPublicProfileSummary(userId: string) {
  const [{ count: favoriteCount }, { count: commentCount }] = await Promise.all([
    supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('game_reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ])

  return {
    favoriteCount: favoriteCount ?? 0,
    commentCount: commentCount ?? 0,
  }
}

import { Tables } from '@/types/database'
import { supabase } from '@/lib/supabaseClient'

type Profile = Tables<'profiles'>

export type PublicProfile = Pick<
  Profile,
  'id' | 'username' | 'public_handle' | 'avatar_url' | 'bio' | 'xp_points' | 'created_at'
>

export async function getPublicProfiles() {
  const { data } = await supabase
    .from('profiles')
    .select('id, username, public_handle, avatar_url, bio, xp_points, created_at')
    .order('xp_points', { ascending: false })
    .order('username', { ascending: true })

  return (data as PublicProfile[] | null) ?? []
}

export async function getPublicProfileByHandle(handle: string) {
  const normalizedHandle = handle.replace(/^@+/, '')
  const { data } = await supabase
    .from('profiles')
    .select('id, username, public_handle, avatar_url, bio, xp_points, created_at')
    .eq('public_handle', normalizedHandle)
    .maybeSingle()

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

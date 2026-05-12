import { Tables } from '@/types/database'
import { supabase } from '@/lib/supabaseClient'

type Profile = Tables<'profiles'>

export type PublicProfile = Pick<
  Profile,
  'id' | 'username' | 'public_handle' | 'avatar_url' | 'bio' | 'xp_points' | 'created_at'
>

export async function getPublicProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, public_handle, avatar_url, bio, xp_points, created_at')
    .order('xp_points', { ascending: false })
    .order('username', { ascending: true })

  if (error) {
    const { data: legacyProfiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, bio, xp_points, created_at')
      .order('xp_points', { ascending: false })
      .order('username', { ascending: true })

    return ((legacyProfiles as Array<Omit<PublicProfile, 'public_handle'>> | null) ?? []).map((profile) => ({
      ...profile,
      public_handle: profile.username,
    }))
  }

  return (data as PublicProfile[] | null) ?? []
}

export async function getPublicProfileByHandle(handle: string) {
  const normalizedHandle = handle.replace(/^@+/, '')
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, public_handle, avatar_url, bio, xp_points, created_at')
    .eq('public_handle', normalizedHandle)
    .maybeSingle()

  if (data && !error) {
    return data as PublicProfile
  }

  const { data: legacyProfile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, xp_points, created_at')
    .eq('username', normalizedHandle)
    .maybeSingle()

  if (!legacyProfile) {
    return null
  }

  const legacy = legacyProfile as Omit<PublicProfile, 'public_handle'>

  return {
    ...legacy,
    public_handle: legacy.username,
  }
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

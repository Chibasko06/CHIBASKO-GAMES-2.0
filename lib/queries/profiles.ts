import { DataAccessError, readData } from '@/lib/dataAccess'
import { Tables } from '@/types/database'
import { supabase } from '@/lib/supabaseClient'
import { readAllRows } from '@/lib/pagination'
import type { ProfileRoles } from '@/lib/profileRoles'

type Profile = Tables<'profiles'>

export type PublicProfile = Pick<
  Profile,
  'id' | 'username' | 'avatar_url' | 'bio' | 'created_at'
> & { roles?: ProfileRoles }

export async function getCommunityProfilesPage(search = '', page = 1, role = 'all', id: string | null = null) {
  const { data } = await readData('community_profiles', supabase.rpc('public_profiles_page', { p_search: search, p_page: page, p_role: role, p_id: id }))
  const result = data as unknown as { items: PublicProfile[]; total: number } | null
  if (!result || !Array.isArray(result.items) || result.items.length > 24 || !Number.isSafeInteger(result.total) || result.total < 0
    || result.items.some(item => !item || typeof item.id !== 'string' || typeof item.username !== 'string'
      || typeof item.roles?.admin !== 'boolean' || typeof item.roles?.developer !== 'boolean'
      || (item.avatar_url !== null && typeof item.avatar_url !== 'string')
      || (item.bio !== null && typeof item.bio !== 'string')
      || typeof item.created_at !== 'string')) throw new DataAccessError('unexpected_error')
  return {
    total: result.total,
    items: result.items.map(({ id, username, avatar_url, bio, created_at, roles }) => ({
      id, username, avatar_url, bio, created_at,
      roles: {admin: roles!.admin, developer: roles!.developer},
    })),
  }
}

export async function getPublicProfiles() {
  return readAllRows<PublicProfile>('public_profiles', (from, to) => supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, created_at', { count: 'exact' })
    .order('username', { ascending: true }).order('id').range(from, to))
}

export async function getPublicProfilesPage(search = '', page = 1) {
  const escaped = search.trim().slice(0, 80).replace(/[\\%_]/g, '\\$&')
  const { data, count } = await readData('public_profiles_page', supabase.from('profiles').select('id, username, avatar_url, bio, created_at', { count: 'exact' }).ilike('username', '%' + escaped + '%').order('username').order('id').range((page - 1) * 24, page * 24 - 1))
  if (count === null) throw new Error('profile_count_unavailable')
  return { items: (data ?? []) as PublicProfile[], total: count }
}

export async function getPublicProfileIds() { return readAllRows<{ id: string }>('sitemap_profiles', (from, to) => supabase.from('profiles').select('id', { count: 'exact' }).order('id').range(from, to)) }

export async function getPublicProfileByUsername(username: string) {
  const { data } = await readData('profile_by_username', supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, created_at')
    .eq('username', username)
    .maybeSingle())

  return (data as PublicProfile | null) ?? null
}

export async function getPublicProfileById(id: string) {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return null
  const { data } = await readData('profile_by_id', supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, created_at')
    .eq('id', id)
    .maybeSingle())

  return (data as PublicProfile | null) ?? null
}

export async function getPublicProfileSummary(userId: string) {
  const [{ count: favoriteCount }, { count: commentCount }] = await Promise.all([
    readData('profile_favorite_count', supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', userId)),
    readData('profile_review_count', supabase.from('game_reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId)),
  ])

  return {
    favoriteCount: favoriteCount ?? 0,
    commentCount: commentCount ?? 0,
  }
}

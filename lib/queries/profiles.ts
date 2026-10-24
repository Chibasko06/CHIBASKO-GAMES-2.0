import {readData} from '@/lib/dataAccess'
import { Tables } from '@/types/database'
import { supabase } from '@/lib/supabaseClient'
import {readAllRows} from '@/lib/pagination'

type Profile = Tables<'profiles'>

export type PublicProfile = Pick<
  Profile,
  'id' | 'username' | 'avatar_url' | 'bio' | 'created_at'
>

export async function getPublicProfiles() {
  return readAllRows<PublicProfile>('public_profiles',(from,to)=>supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, created_at',{count:'exact'})
    .order('username', { ascending: true }).order('id').range(from,to))
}

export async function getPublicProfilesPage(search='',page=1){
 const escaped=search.trim().slice(0,80).replace(/[\\%_]/g,'\\$&')
 const {data,count}=await readData('public_profiles_page',supabase.from('profiles').select('id, username, avatar_url, bio, created_at',{count:'exact'}).ilike('username','%'+escaped+'%').order('username').order('id').range((page-1)*24,page*24-1))
 if(count===null)throw new Error('profile_count_unavailable')
 return {items:(data??[]) as PublicProfile[],total:count}
}

export async function getPublicProfileIds(){return readAllRows<{id:string}>('sitemap_profiles',(from,to)=>supabase.from('profiles').select('id',{count:'exact'}).order('id').range(from,to))}

export async function getPublicProfileByUsername(username: string) {
  const { data } = await readData('profile_by_username', supabase
    .from('profiles')
    .select('id, username, avatar_url, bio, created_at')
    .eq('username', username)
    .maybeSingle())

  return (data as PublicProfile | null) ?? null
}

export async function getPublicProfileById(id: string) {
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

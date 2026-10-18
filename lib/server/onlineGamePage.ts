import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { getGameBySlug } from '@/lib/queries/games'
import { publishedOnlineAccess } from './publishedOnlineAccess'
import { safeAuthNext } from '@/lib/authRedirect'
import { createServerSupabase } from './supabaseSession'

// Catalogue and capability checks precede authentication; invalid routes stay 404.
export async function onlineGamePage(slug: string, access: 'public' | 'private') {
  const game = await getGameBySlug(slug)
  if (!game || !game.active_version_id) notFound()
  if (!await publishedOnlineAccess(game.id, game.active_version_id, access)) notFound()
  const client = await createServerSupabase()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(safeAuthNext(`/games/${game.slug}/${access === 'public' ? 'online' : 'private'}`))}`)
  return game
}

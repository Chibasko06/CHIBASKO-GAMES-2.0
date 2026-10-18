import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { getGameBySlug } from '@/lib/queries/games'
import { getMultiplayerDefinition, isChibaskoMultiplayerGame } from '@/lib/multiplayer/catalogue'
import { publishedOnlineAccess } from './publishedOnlineAccess'
import { safeAuthNext } from '@/lib/authRedirect'
import { createServerSupabase } from './supabaseSession'

// Catalogue and capability checks precede authentication; invalid routes stay 404.
export async function onlineGamePage(slug: string, access: 'public' | 'private') {
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  if (game.active_version_id) { if (!await publishedOnlineAccess(game.id, game.active_version_id, access)) notFound() }
  else if (!isChibaskoMultiplayerGame(game) || !getMultiplayerDefinition(game.multiplayer_game_id)?.capabilities.online?.access.includes(access)) notFound()
  const client = await createServerSupabase()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(safeAuthNext(`/games/${game.slug}/${access === 'public' ? 'online' : 'private'}`))}`)
  return game
}

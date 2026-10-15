import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { getGameBySlug } from '@/lib/queries/games'
import { getMultiplayerDefinition, isChibaskoMultiplayerGame } from '@/lib/multiplayer/catalogue'
import { safeAuthNext } from '@/lib/authRedirect'
import { createServerSupabase } from './supabaseSession'

// Catalogue and capability checks precede authentication; invalid routes stay 404.
export async function onlineGamePage(slug: string, access: 'public' | 'private') {
  const game = await getGameBySlug(slug)
  if (!game || !isChibaskoMultiplayerGame(game) || !getMultiplayerDefinition(game.multiplayer_game_id)?.capabilities.online?.access.includes(access)) notFound()
  const client = await createServerSupabase()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(safeAuthNext(`/games/${game.slug}/${access === 'public' ? 'online' : 'private'}`))}`)
  return game
}

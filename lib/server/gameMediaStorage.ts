import type { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { validateGameThumbnail } from './gameThumbnailValidation'
import { getR2AssetsBucket, managedImageKey, putPublicImage } from './r2Assets'

export async function uploadGameThumbnail(file: File) {
  const thumbnail = await validateGameThumbnail(file)
  return putPublicImage('game-thumbnails', thumbnail)
}

export async function cleanupReplacedGameThumbnail(
  previousUrl: unknown,
  nextUrl: unknown,
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
) {
  const key = managedImageKey(previousUrl, 'game-thumbnails')
  if (!key || previousUrl === nextUrl) return
  try {
    const bucket = getR2AssetsBucket()
    const object = await bucket.head(key)
    if (object?.customMetadata?.application !== 'chibasko-games'
      || object.customMetadata.kind !== 'game-thumbnails') return
    // Profiles may reuse a thumbnail as an avatar. Check both tables and URL variants.
    const [{ count: games, error: gamesError }, { count: profiles, error: profilesError }] = await Promise.all([
      supabaseAdmin.from('games').select('id', { count: 'exact', head: true })
        .ilike('thumbnail_url', `%${key}%`),
      supabaseAdmin.from('profiles').select('id', { count: 'exact', head: true })
        .ilike('avatar_url', `%${key}%`),
    ])
    if (gamesError || profilesError || games !== 0 || profiles !== 0) return
    await bucket.delete(key)
  } catch {
    // The game is already saved: cleanup must never turn success into an error.
    console.error('Replaced R2 thumbnail cleanup could not be completed')
  }
}

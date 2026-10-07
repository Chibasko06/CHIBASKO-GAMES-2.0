import { imageSize } from 'image-size'
import type { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import type { TablesUpdate } from '@/types/database'
import { getR2AssetsBucket, managedImageKey, putPublicImage } from './r2Assets'

type AdminClient = ReturnType<typeof getSupabaseAdminClient>
const profileColumns = 'id, username, display_name, avatar_url, bio, created_at'
const formats: Record<string, string[]> = {
  jpg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'], gif: ['image/gif'],
  ico: ['image/x-icon', 'image/vnd.microsoft.icon'],
}

export class AvatarUpdateError extends Error {
  constructor(message: string, readonly status = 500) { super(message) }
}

export async function uploadAvatarForUser(userId: string, file: File) {
  if (file.size === 0 || file.size > 5 * 1024 * 1024) {
    throw new AvatarUpdateError('Avatar vide ou superieur a 5 Mo.', 400)
  }
  const buffer = new Uint8Array(await file.arrayBuffer())
  let extension: string
  try {
    const dimensions = imageSize(buffer)
    extension = dimensions.type || ''
    const images = dimensions.images || [dimensions]
    if (!formats[extension]?.includes(file.type) || images.some(image =>
      !image.width || !image.height || image.width * image.height > 40_000_000)) {
      throw new Error('Invalid image')
    }
  } catch {
    throw new AvatarUpdateError('Avatar invalide. Utilise un JPG, PNG, WEBP, GIF ou ICO valide (40 megapixels maximum).', 400)
  }
  return putPublicImage('avatars', { buffer, extension, contentType: formats[extension][0] }, userId)
}

export async function cleanupReplacedAvatar(userId: string, previousUrl: unknown, nextUrl: unknown, admin: AdminClient) {
  const key = managedImageKey(previousUrl, 'avatars', userId)
  if (!key || previousUrl === nextUrl) return
  try {
    const bucket = getR2AssetsBucket()
    const object = await bucket.head(key)
    if (object?.customMetadata?.application !== 'chibasko-games'
      || object.customMetadata.kind !== 'avatars' || object.customMetadata.userId !== userId) return
    const [profiles, games] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('avatar_url', `%${key}%`),
      admin.from('games').select('id', { count: 'exact', head: true }).ilike('thumbnail_url', `%${key}%`),
    ])
    if (profiles.error || games.error || profiles.count !== 0 || games.count !== 0) return
    await bucket.delete(key)
  } catch {
    // Profile changes have succeeded; failed cleanup safely leaves the object in R2.
    console.error('Replaced R2 avatar cleanup could not be completed')
  }
}

async function previousAvatar(userId: string, admin: AdminClient) {
  const { data, error } = await admin.from('profiles').select('avatar_url').eq('id', userId).single()
  if (error || !data) throw new AvatarUpdateError('Impossible de lire le profil.')
  return data.avatar_url
}

async function saveAvatar(userId: string, previousUrl: string | null, avatarUrl: string | null,
  admin: AdminClient, fields: Pick<TablesUpdate<'profiles'>, 'username' | 'display_name' | 'bio'> = {}) {
  let update = admin.from('profiles').update({ ...fields, avatar_url: avatarUrl }).eq('id', userId)
  update = previousUrl === null ? update.is('avatar_url', null) : update.eq('avatar_url', previousUrl)
  const { data, error } = await update.select(profileColumns).single()
  if (error || !data) {
    throw new AvatarUpdateError('Impossible de sauvegarder l avatar.', error?.code === 'PGRST116' ? 409 : 500)
  }
  await cleanupReplacedAvatar(userId, previousUrl, data.avatar_url, admin)
  return data
}

export async function replaceAvatarForUser(userId: string, file: File, admin: AdminClient) {
  const previousUrl = await previousAvatar(userId, admin)
  const avatarUrl = await uploadAvatarForUser(userId, file)
  return saveAvatar(userId, previousUrl, avatarUrl, admin)
}

export async function updateAvatarForUser(userId: string, avatarUrl: string | null, admin: AdminClient,
  fields: Pick<TablesUpdate<'profiles'>, 'username' | 'display_name' | 'bio'> = {}) {
  const previousUrl = await previousAvatar(userId, admin)
  return saveAvatar(userId, previousUrl, avatarUrl, admin, fields)
}

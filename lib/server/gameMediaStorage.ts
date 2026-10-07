import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { validateGameThumbnail } from './gameThumbnailValidation'

const GAME_THUMBNAILS_BUCKET = 'game-thumbnails'
const GAME_THUMBNAIL_CACHE_SECONDS = 60 * 60 * 24 * 365
const SUPPORTED_GAME_THUMBNAIL_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
])

function slugifyFileBase(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function ensureGameThumbnailsBucket() {
  const supabaseAdmin = getSupabaseAdminClient()
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()

  if (listError) {
    throw listError
  }

  const exists = (buckets || []).some(
    (bucket) => bucket.name === GAME_THUMBNAILS_BUCKET || bucket.id === GAME_THUMBNAILS_BUCKET
  )

  if (exists) {
    return supabaseAdmin
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(GAME_THUMBNAILS_BUCKET, {
    public: true,
    fileSizeLimit: 8 * 1024 * 1024,
    allowedMimeTypes: Array.from(SUPPORTED_GAME_THUMBNAIL_TYPES),
  })

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw createError
  }

  return supabaseAdmin
}

export async function uploadGameThumbnail(file: File, slug?: string) {
  // Validate before performing any Storage operation; retain the original bytes.
  const thumbnail = await validateGameThumbnail(file)
  const supabaseAdmin = await ensureGameThumbnailsBucket()
  const baseName = slugifyFileBase(slug || file.name.replace(/\.[^.]+$/, '') || 'game')
  const filePath = `${baseName}-${crypto.randomUUID()}.${thumbnail.extension}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(GAME_THUMBNAILS_BUCKET)
    .upload(filePath, thumbnail.buffer, {
      upsert: false,
      contentType: thumbnail.contentType,
      cacheControl: String(GAME_THUMBNAIL_CACHE_SECONDS),
    })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabaseAdmin.storage.from(GAME_THUMBNAILS_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

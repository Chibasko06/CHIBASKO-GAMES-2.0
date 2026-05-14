import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import sharp from 'sharp'

const GAME_THUMBNAILS_BUCKET = 'game-thumbnails'
const GAME_THUMBNAIL_MAX_WIDTH = 1280
const GAME_THUMBNAIL_MAX_HEIGHT = 720
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

function isSupportedGameThumbnailType(file: File) {
  return SUPPORTED_GAME_THUMBNAIL_TYPES.has(file.type)
}

async function optimizeGameThumbnail(file: File) {
  if (!isSupportedGameThumbnailType(file)) {
    throw new Error('Format miniature non pris en charge. Utilise JPG, PNG, WEBP, GIF, AVIF ou SVG.')
  }

  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    const optimizedBuffer = await sharp(inputBuffer, { animated: false })
      .rotate()
      .resize({
        width: GAME_THUMBNAIL_MAX_WIDTH,
        height: GAME_THUMBNAIL_MAX_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: 82,
        effort: 4,
      })
      .toBuffer()

    return {
      buffer: optimizedBuffer,
      contentType: 'image/webp',
      extension: 'webp',
    }
  } catch {
    throw new Error('Impossible d optimiser cette miniature. Essaie plutot un JPG, PNG ou WEBP classique.')
  }
}

export async function uploadGameThumbnail(file: File, slug?: string) {
  const supabaseAdmin = await ensureGameThumbnailsBucket()
  const baseName = slugifyFileBase(slug || file.name.replace(/\.[^.]+$/, '') || 'game')
  const optimizedThumbnail = await optimizeGameThumbnail(file)
  const filePath = `${baseName}-${Date.now()}.${optimizedThumbnail.extension}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from(GAME_THUMBNAILS_BUCKET)
    .upload(filePath, optimizedThumbnail.buffer, {
      upsert: true,
      contentType: optimizedThumbnail.contentType,
      cacheControl: String(GAME_THUMBNAIL_CACHE_SECONDS),
    })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabaseAdmin.storage.from(GAME_THUMBNAILS_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

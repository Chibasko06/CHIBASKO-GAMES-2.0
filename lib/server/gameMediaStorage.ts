import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

const GAME_THUMBNAILS_BUCKET = 'game-thumbnails'

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
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'],
  })

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw createError
  }

  return supabaseAdmin
}

export async function uploadGameThumbnail(file: File, slug?: string) {
  const supabaseAdmin = await ensureGameThumbnailsBucket()
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
  const baseName = slugifyFileBase(slug || file.name.replace(/\.[^.]+$/, '') || 'game')
  const filePath = `${baseName}-${Date.now()}.${extension}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabaseAdmin.storage
    .from(GAME_THUMBNAILS_BUCKET)
    .upload(filePath, arrayBuffer, {
      upsert: true,
      contentType: file.type || 'image/png',
    })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabaseAdmin.storage.from(GAME_THUMBNAILS_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

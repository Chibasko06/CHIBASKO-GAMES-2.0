import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

const AVATAR_BUCKET = 'avatars'

export async function ensureAvatarBucket() {
  const supabaseAdmin = getSupabaseAdminClient()
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets()

  if (listError) {
    throw listError
  }

  const exists = (buckets || []).some((bucket) => bucket.name === AVATAR_BUCKET || bucket.id === AVATAR_BUCKET)

  if (exists) {
    return supabaseAdmin
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: 5 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon'],
  })

  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw createError
  }

  return supabaseAdmin
}

export async function uploadAvatarForUser(userId: string, file: File) {
  const supabaseAdmin = await ensureAvatarBucket()
  const extension = file.name.split('.').pop()?.toLowerCase() || 'png'
  const filePath = `${userId}/avatar.${extension}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadError } = await supabaseAdmin.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, arrayBuffer, {
      upsert: true,
      contentType: file.type || 'image/png',
    })

  if (uploadError) {
    throw uploadError
  }

  const { data } = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)
  return data.publicUrl
}

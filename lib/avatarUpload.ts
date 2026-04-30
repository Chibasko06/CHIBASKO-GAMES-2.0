import { supabase } from '@/lib/supabaseClient'

async function uploadAvatarViaRoute(endpoint: string, file: File) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Session introuvable pour l envoi de l avatar.')
  }

  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || 'Echec de l upload avatar.')
  }

  return payload.avatarUrl as string
}

export async function uploadOwnAvatar(file: File) {
  return uploadAvatarViaRoute('/api/profile/avatar', file)
}

export async function uploadAdminAvatar(userId: string, file: File) {
  return uploadAvatarViaRoute(`/api/admin/users/${userId}/avatar`, file)
}

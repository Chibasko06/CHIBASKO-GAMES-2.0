import { supabase } from '@/lib/supabaseClient'
import type { Tables } from '@/types/database'

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

  return payload as { avatarUrl: string; profile?: Tables<'profiles'> }
}

export async function uploadOwnAvatar(file: File) {
  const payload = await uploadAvatarViaRoute('/api/profile/avatar', file)
  if (!payload.profile) throw new Error('Profil introuvable apres l upload.')
  return payload.profile
}

export async function uploadAdminAvatar(userId: string, file: File) {
  return (await uploadAvatarViaRoute(`/api/admin/users/${userId}/avatar`, file)).avatarUrl
}

export async function removeOwnAvatar() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Session introuvable pour supprimer l avatar.')
  const response = await fetch('/api/profile/avatar', {
    method: 'DELETE', headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.profile) throw new Error(payload?.error || 'Suppression avatar impossible.')
  return payload.profile as Tables<'profiles'>
}

export async function uploadAdminGameThumbnail(file: File, slug?: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Session introuvable pour l envoi de la miniature.')
  }

  const formData = new FormData()
  formData.append('file', file)

  if (slug?.trim()) {
    formData.append('slug', slug.trim())
  }

  const response = await fetch('/api/admin/games/thumbnail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    body: formData,
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error || 'Echec de l upload miniature.')
  }

  return payload.thumbnailUrl as string
}

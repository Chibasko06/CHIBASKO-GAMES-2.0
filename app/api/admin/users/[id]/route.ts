import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../../_utils'
import { AvatarUpdateError, updateAvatarForUser } from '@/lib/server/avatarStorage'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { id } = await params
  const { supabaseAdmin } = adminCheck
  let body: Record<string, unknown>
  try { body = await readAdminJson(request) }
  catch { return adminJson({ error: 'Formulaire invalide.' }, { status: 400 }) }
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  if ((body.avatar_url != null && typeof body.avatar_url !== 'string') ||
      (body.bio != null && typeof body.bio !== 'string')) {
    return adminJson({ error: 'Formulaire invalide.' }, { status: 400 })
  }

  const payload = {
    username,
    display_name: username || null,
    avatar_url: typeof body.avatar_url === 'string' ? body.avatar_url || null : null,
    bio: typeof body.bio === 'string' ? body.bio || null : null,
  }

  try {
    const { avatar_url, ...fields } = payload
    const data = await updateAvatarForUser(id, avatar_url, supabaseAdmin, fields)
    return adminJson({ user: data })
  } catch (error) {
    return adminJson({ error: adminErrorMessage(error) },
      { status: error instanceof AvatarUpdateError ? error.status : 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { id } = await params
  const { supabaseAdmin } = adminCheck

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ success: true })
}

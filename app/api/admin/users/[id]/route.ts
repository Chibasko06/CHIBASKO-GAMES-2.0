import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson } from '../../_utils'
import { AvatarUpdateError, updateAvatarForUser } from '@/lib/server/avatarStorage'
import {requestAccountDeletion} from '@/lib/server/accountDeletion'
import {adminUserProfile} from '@/lib/server/adminUserProfile'
import {profileFailure} from '@/lib/server/profileRequest'

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
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))return adminJson({error:'Compte invalide.'},{status:400})
  let body: Record<string, unknown>
  // Le corps contient les nouvelles valeurs et l’instantané du profil édité.
  try { body = await readAdminJson(request, 2 * 16_384 + 4096) }
  catch { return adminJson({ error: 'Formulaire invalide.' }, { status: 400 }) }
  try {
    const {fields,avatarUrl,expected}=adminUserProfile(body)
    const data = await updateAvatarForUser(id, avatarUrl, supabaseAdmin, fields, expected)
    return adminJson({ user: data })
  } catch (error) {
    if(error instanceof AvatarUpdateError)return adminJson({error:error.message},{status:error.status})
    return profileFailure('admin_profile_update',error)
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
  if(id.toLowerCase()===adminCheck.user.id.toLowerCase())return adminJson({error:'Utilisez la suppression personnelle depuis le tableau de bord pour votre propre compte.'},{status:403})
  return requestAccountDeletion(adminCheck.user.id,id)
}

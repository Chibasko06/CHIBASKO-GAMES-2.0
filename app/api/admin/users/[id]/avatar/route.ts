import { NextRequest } from 'next/server'
import { requireAdmin, adminJson, adminErrorMessage } from '../../../_utils'
import { AvatarUpdateError, replaceAvatarForUser } from '@/lib/server/avatarStorage'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { id } = await params
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))return adminJson({error:'Compte invalide.'},{status:400})
  let formData: FormData
  try { formData = await request.formData() }
  catch { return adminJson({ error: 'Fichier invalide.' }, { status: 400 }) }
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return adminJson({ error: 'Fichier avatar manquant.' }, { status: 400 })
  }

  try {
    const { supabaseAdmin } = adminCheck
    const data = await replaceAvatarForUser(id, file, supabaseAdmin)
    return adminJson({ avatarUrl: data.avatar_url, user: data })
  } catch (error) {
    return adminJson(
      { error: error instanceof AvatarUpdateError ? error.message : adminErrorMessage(error) },
      { status: error instanceof AvatarUpdateError ? error.status : 500 }
    )
  }
}

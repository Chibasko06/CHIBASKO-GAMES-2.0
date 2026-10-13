import { NextRequest } from 'next/server'
import { requireAdmin, adminJson, adminErrorMessage } from '../../_utils'
import { uploadGameThumbnail } from '@/lib/server/gameMediaStorage'

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  let formData: FormData
  try { formData = await request.formData() }
  catch { return adminJson({ error: 'Fichier invalide.' }, { status: 400 }) }
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return adminJson({ error: 'Fichier miniature manquant.' }, { status: 400 })
  }

  try {
    const thumbnailUrl = await uploadGameThumbnail(file)
    return adminJson({ thumbnailUrl })
  } catch (error) {
    return adminJson(
      { error: adminErrorMessage(error) },
      { status: 500 }
    )
  }
}

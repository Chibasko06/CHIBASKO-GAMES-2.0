import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'
import { uploadGameThumbnail } from '@/lib/server/gameMediaStorage'

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const formData = await request.formData()
  const file = formData.get('file')
  const slug = typeof formData.get('slug') === 'string' ? String(formData.get('slug')) : ''

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier miniature manquant.' }, { status: 400 })
  }

  try {
    const thumbnailUrl = await uploadGameThumbnail(file, slug)
    return NextResponse.json({ thumbnailUrl })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload miniature impossible.' },
      { status: 500 }
    )
  }
}

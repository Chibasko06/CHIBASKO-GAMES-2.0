import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../_utils'
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
  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier avatar manquant.' }, { status: 400 })
  }

  try {
    const { supabaseAdmin } = adminCheck
    const data = await replaceAvatarForUser(id, file, supabaseAdmin)
    return NextResponse.json({ avatarUrl: data.avatar_url, user: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload avatar impossible.' },
      { status: error instanceof AvatarUpdateError ? error.status : 500 }
    )
  }
}

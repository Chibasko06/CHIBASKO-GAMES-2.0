import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../../_utils'
import { uploadAvatarForUser } from '@/lib/server/avatarStorage'

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
    const avatarUrl = await uploadAvatarForUser(id, file)
    const { supabaseAdmin } = adminCheck
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ avatarUrl, user: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload avatar impossible.' },
      { status: 500 }
    )
  }
}

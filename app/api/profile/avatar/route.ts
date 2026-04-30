import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { uploadAvatarForUser } from '@/lib/server/avatarStorage'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdminClient()
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: userError?.message || 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier avatar manquant.' }, { status: 400 })
  }

  try {
    const avatarUrl = await uploadAvatarForUser(user.id, file)
    return NextResponse.json({ avatarUrl })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload avatar impossible.' },
      { status: 500 }
    )
  }
}

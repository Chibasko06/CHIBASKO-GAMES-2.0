import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { AvatarUpdateError, replaceAvatarForUser, updateAvatarForUser } from '@/lib/server/avatarStorage'

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const supabaseAdmin = getSupabaseAdminClient()
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    return { error: NextResponse.json({ error: userError?.message || 'Unauthorized' }, { status: 401 }) }
  }
  return { supabaseAdmin, user }
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if ('error' in auth) return auth.error

  const formData = await request.formData()
  const file = formData.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fichier avatar manquant.' }, { status: 400 })
  }

  try {
    const profile = await replaceAvatarForUser(auth.user.id, file, auth.supabaseAdmin)
    return NextResponse.json({ avatarUrl: profile.avatar_url, profile })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload avatar impossible.' },
      { status: error instanceof AvatarUpdateError ? error.status : 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request)
  if ('error' in auth) return auth.error
  try {
    const profile = await updateAvatarForUser(auth.user.id, null, auth.supabaseAdmin)
    return NextResponse.json({ avatarUrl: null, profile })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Suppression avatar impossible.' },
      { status: error instanceof AvatarUpdateError ? error.status : 500 })
  }
}

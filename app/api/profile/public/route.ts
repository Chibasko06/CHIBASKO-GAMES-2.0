import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

export async function PATCH(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null

  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdminClient()
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: userError?.message || 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const bio = typeof body.bio === 'string' ? body.bio.trim() : ''

  if (!username) {
    return NextResponse.json({ error: 'Pseudo obligatoire.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      username,
      display_name: username,
      bio: bio || null,
    })
    .eq('id', user.id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck

  const [{ data: profiles, error: profilesError }, { data: authUsers, error: authError }] =
    await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false }),
      supabaseAdmin.auth.admin.listUsers(),
    ])

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 })
  }

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const emailById = new Map(
    (authUsers.users || []).map((user) => [user.id, user.email ?? null])
  )

  const users = (profiles || []).map((profile) => ({
    ...profile,
    email: emailById.get(profile.id) ?? null,
  }))

  return NextResponse.json({ users })
}

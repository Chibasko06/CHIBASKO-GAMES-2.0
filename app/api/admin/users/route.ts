import { NextRequest } from 'next/server'
import { requireAdmin, adminJson, adminErrorMessage } from '../_utils'

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
        .select('id, username, display_name, avatar_url, bio, created_at')
        .order('created_at', { ascending: false }),
      supabaseAdmin.auth.admin.listUsers(),
    ])

  if (profilesError) {
    return adminJson({ error: adminErrorMessage(profilesError) }, { status: 500 })
  }

  if (authError) {
    return adminJson({ error: adminErrorMessage(authError) }, { status: 500 })
  }

  const emailById = new Map(
    (authUsers.users || []).map((user) => [user.id, user.email ?? null])
  )

  const users = (profiles || []).map((profile) => ({
    ...profile,
    email: emailById.get(profile.id) ?? null,
  }))

  return adminJson({ users })
}

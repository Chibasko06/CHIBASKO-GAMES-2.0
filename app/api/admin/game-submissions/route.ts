import { NextRequest } from 'next/server'
import { requireAdmin, adminJson, adminErrorMessage } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const { data, error } = await supabaseAdmin
    .from('game_submissions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ submissions: data ?? [] })
}

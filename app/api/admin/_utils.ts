import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database'
import { isAdminEmail } from '@/lib/adminAuth'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { logAdminAuthorization } from '@/lib/server/adminDiagnostics'
import { logSupabaseAuthValidation } from '@/lib/server/supabaseAuthDiagnostics'

export async function requireAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    logAdminAuthorization(request, false, null)
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) {
    logAdminAuthorization(request, true, null, false, true)
    return {
      error: NextResponse.json({ error: 'Supabase env is missing' }, { status: 500 }),
    }
  }

  const authClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser()

  logSupabaseAuthValidation(token, anonKey, supabaseUrl, authError)
  logAdminAuthorization(request, true, user, Boolean(authError))

  if (!user || !isAdminEmail(user.email)) {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return {
    supabaseAdmin: getSupabaseAdminClient(),
    user,
  }
}

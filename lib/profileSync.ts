import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export async function ensureProfile(sessionOverride?: Session | null) {
  const session =
    sessionOverride ??
    (
      await supabase.auth.getSession()
    ).data.session

  if (!session?.access_token) {
    return { ok: false, error: 'No active session' }
  }

  const response = await fetch('/api/profile/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    return {
      ok: false,
      error: payload?.error || 'Profile sync failed',
    }
  }

  const payload = await response.json().catch(() => ({}))

  return {
    ok: true,
    profile: payload.profile,
  }
}

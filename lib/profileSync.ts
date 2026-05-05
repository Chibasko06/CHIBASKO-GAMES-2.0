import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

type ProfileSyncResult =
  | { ok: false; error: string }
  | { ok: true; profile: unknown }

let inFlightProfileSync: Promise<ProfileSyncResult> | null = null

export async function ensureProfile(sessionOverride?: Session | null): Promise<ProfileSyncResult> {
  if (!sessionOverride && inFlightProfileSync) {
    return inFlightProfileSync
  }

  const runSync = async (): Promise<ProfileSyncResult> => {
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
      error: String(payload?.error || 'Profile sync failed'),
    }
  }

  const payload = await response.json().catch(() => ({}))

  return {
    ok: true,
    profile: payload.profile,
  }
  }

  if (sessionOverride) {
    return runSync()
  }

  inFlightProfileSync = runSync().finally(() => {
    inFlightProfileSync = null
  })

  return inFlightProfileSync
}

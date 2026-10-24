import type {Session} from '@supabase/supabase-js'
import {supabase} from '@/lib/supabaseClient'
import {withTimeout, fetchJson} from '@/lib/asyncOperation'

type ProfileSyncResult = {ok: false; error: string} | {ok: true; profile: unknown}
let inFlightProfileSync: Promise<ProfileSyncResult> | null = null

export async function ensureProfile(sessionOverride?: Session | null): Promise<ProfileSyncResult> {
  if (!sessionOverride && inFlightProfileSync) return inFlightProfileSync
  const runSync = async (): Promise<ProfileSyncResult> => {
    try {
      const session = sessionOverride ?? (await withTimeout(supabase.auth.getSession())).data.session
      if (!session?.access_token) return {ok: false, error: 'Connexion requise.'}
      const {response, payload} = await fetchJson('/api/profile/sync', {
        method: 'POST', headers: {Authorization: 'Bearer ' + session.access_token},
      })
      if (!response.ok || !payload?.profile) return {ok: false, error: 'Impossible de préparer le profil. Réessaie dans un instant.'}
      return {ok: true, profile: payload.profile}
    } catch { return {ok: false, error: 'Connexion interrompue. Réessaie dans un instant.'} }
  }
  if (sessionOverride) return runSync()
  inFlightProfileSync = runSync().finally(() => { inFlightProfileSync = null })
  return inFlightProfileSync
}

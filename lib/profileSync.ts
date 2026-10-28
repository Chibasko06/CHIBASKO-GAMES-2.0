import type {Session} from '@supabase/supabase-js'
import {supabase} from '@/lib/supabaseClient'
import {withTimeout, fetchJson} from '@/lib/asyncOperation'

type ProfileSyncResult = {ok: false; error: string; kind: 'session_unavailable' | 'session_expired' | 'profile_missing' | 'profile_unavailable' | 'network_error'} | {ok: true; profile: unknown}
const inFlightProfileSync = new Map<string, Promise<ProfileSyncResult>>()

export async function ensureProfile(sessionOverride?: Session | null): Promise<ProfileSyncResult> {
  try {
    const result = sessionOverride ? null : await withTimeout(supabase.auth.getSession())
    if (result?.error) {
      const denied = [400, 401, 403].includes(result.error.status ?? 0)
      return denied
        ? {ok: false, kind: 'session_expired', error: 'La session a expiré. Reconnecte-toi.'}
        : {ok: false, kind: 'network_error', error: 'Impossible de vérifier la session. Réessaie dans un instant.'}
    }
    const session = sessionOverride ?? result?.data.session
    if (!session?.access_token) return {ok: false, kind: 'session_unavailable', error: 'Connexion requise.'}
    const token = session.access_token
    const pending = inFlightProfileSync.get(token)
    if (pending) return pending
    const runSync = async (): Promise<ProfileSyncResult> => {
      try {
        const {response, payload} = await fetchJson('/api/profile/sync', {
          method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: '{}',
        })
        if (response.status === 401) return {ok: false, kind: 'session_expired', error: 'La session a expiré. Reconnecte-toi.'}
        if (response.status === 404) return {ok: false, kind: 'profile_missing', error: 'Le profil est introuvable. Contacte Chibasko Games si le problème persiste.'}
        if (!response.ok || !payload?.profile) return {ok: false, kind: 'profile_unavailable', error: 'Impossible de préparer le profil. Réessaie dans un instant. Si le problème persiste, contacte Chibasko Games.'}
        return {ok: true, profile: payload.profile}
      } catch { return {ok: false, kind: 'network_error', error: 'Connexion interrompue. Réessaie dans un instant.'} }
    }
    const operation = runSync().finally(() => { if (inFlightProfileSync.get(token) === operation) inFlightProfileSync.delete(token) })
    inFlightProfileSync.set(token, operation)
    return operation
  } catch { return {ok: false, kind: 'network_error', error: 'Connexion interrompue. Réessaie dans un instant.'} }
}

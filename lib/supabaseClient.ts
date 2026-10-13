import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database'

export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' } }
)

// One-time transition from the old browser storage. This restores authentication
// only; the server still validates the user and DB membership on every admin call.
export async function restoreBrowserSession() {
  const { data } = await supabase.auth.getSession()
  if (typeof window === 'undefined') return data.session
  const key = `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]}-auth-token`
  try {
    const legacy = window.localStorage.getItem(key)
    if (!legacy) return data.session
    window.localStorage.removeItem(key)
    if (data.session) return data.session
    const value: unknown = JSON.parse(legacy)
    if (!value || typeof value !== 'object' || !('access_token' in value) || !('refresh_token' in value)
      || typeof value.access_token !== 'string' || typeof value.refresh_token !== 'string') return null
    const restored = await supabase.auth.setSession({ access_token: value.access_token, refresh_token: value.refresh_token })
    return restored.error ? null : restored.data.session
  } catch { return data.session }
}

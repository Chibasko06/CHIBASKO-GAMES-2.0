import { createClient } from '@supabase/supabase-js'

export type AuthenticatedPlayer = Readonly<{
  userId: string
  username: string
  avatarUrl: string | null
  expiresAt: number
}>
export type Authenticate = (token: string | undefined) => Promise<AuthenticatedPlayer>

export function createSupabaseAuthenticator(
  url: string,
  key: string,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
): Authenticate {
  if (!url || !key || key.startsWith('sb_secret_')) throw new Error('Invalid public Supabase configuration')
  // Legacy keys must be anon keys, never service_role.
  if (!key.startsWith('sb_publishable_')) {
    try {
      if (JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role !== 'anon') throw new Error()
    } catch { throw new Error('Invalid public Supabase configuration') }
  }
  return async token => {
    try {
      if (!token || token.length > 16384 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error()
      const signal = AbortSignal.timeout(7000)
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: {
          headers: { Authorization: `Bearer ${token}` },
          fetch: async (input, init) => {
            try { return await fetcher(input, { ...init, signal }) }
            catch { return new Response(JSON.stringify({ message: 'Authentication unavailable' }), { status: 503, headers: { 'Content-Type': 'application/json' } }) }
          },
        },
      })
      const { data, error } = await client.auth.getUser(token)
      if (error || !data.user || data.user.is_anonymous) throw new Error()
      // Decode only AFTER Auth has verified this token. Identity always comes from getUser.
      const { exp } = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString())
      if (!Number.isSafeInteger(exp) || exp * 1000 <= now()) throw new Error()
      const { data: profile, error: profileError } = await client.from('profiles')
        .select('id, username, avatar_url').eq('id', data.user.id).maybeSingle()
      if (profileError || !profile || profile.id !== data.user.id || typeof profile.username !== 'string'
        || !profile.username.trim() || profile.username.length > 100) throw new Error()
      if (profile.avatar_url !== null) {
        if (typeof profile.avatar_url !== 'string') throw new Error()
        const avatar = new URL(profile.avatar_url)
        if (!['https:', 'http:'].includes(avatar.protocol) || avatar.username || avatar.password) throw new Error()
      }
      if (exp * 1000 <= now()) throw new Error()
      return { userId: data.user.id, username: profile.username, avatarUrl: profile.avatar_url, expiresAt: exp * 1000 }
    } catch { throw new Error('Authentication refused') }
  }
}

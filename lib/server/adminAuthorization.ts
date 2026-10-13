import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export class AdminAccessError extends Error {
  constructor(readonly status: 401 | 403 | 503) { super(status === 401 ? 'Connexion requise.' : status === 403 ? 'Accès refusé.' : 'Administration temporairement indisponible.') }
}
export function createUserAuthClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new AdminAccessError(503)
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } })
}
// Never trust getSession(), email, user_metadata or any browser role flag.
// Membership is read with the verified user's JWT and an own-row SELECT policy.
export async function authorizeAdmin(client: SupabaseClient<Database>, token?: string) {
  let userId: string
  try {
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) throw new AdminAccessError(401)
    userId = data.user.id
  } catch (error) { if (error instanceof AdminAccessError) throw error; throw new AdminAccessError(503) }
  try {
    const { data, error } = await client.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
    if (error) throw new AdminAccessError(503)
    if (!data || data.user_id !== userId) throw new AdminAccessError(403)
  } catch (error) { if (error instanceof AdminAccessError) throw error; throw new AdminAccessError(503) }
  return { id: userId }
}

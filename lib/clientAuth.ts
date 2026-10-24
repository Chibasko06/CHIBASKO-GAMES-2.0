import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import {withTimeout} from './asyncOperation'

export async function getClientSession(): Promise<Session | null> {
  const {
    data: { session }, error,
  } = await withTimeout(supabase.auth.getSession())
  if (error) throw new Error('Impossible de vérifier la session. Réessaie dans un instant.')

  return session
}

export async function getClientSessionUser(): Promise<User | null> {
  const session = await getClientSession()
  return session?.user ?? null
}

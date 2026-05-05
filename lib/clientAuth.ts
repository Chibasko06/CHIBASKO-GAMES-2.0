import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export async function getClientSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  return session
}

export async function getClientSessionUser(): Promise<User | null> {
  const session = await getClientSession()
  return session?.user ?? null
}

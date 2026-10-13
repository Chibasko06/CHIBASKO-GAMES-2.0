import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createServerSupabase() {
  const jar = await cookies()
  return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: { getAll: () => jar.getAll(), setAll() {
      // Server Components cannot set cookies. /admin proxy performs refresh first.
    } },
  })
}

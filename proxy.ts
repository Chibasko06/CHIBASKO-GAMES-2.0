import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { authorizeAdmin, AdminAccessError } from '@/lib/server/adminAuthorization'
import { safeAuthNext } from '@/lib/authRedirect'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const client = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { sameSite: 'lax', secure: process.env.NODE_ENV === 'production' },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of values) response.cookies.set(name, value, options)
      },
    },
  })
  try { await authorizeAdmin(client) }
  catch (error) {
    let denied: NextResponse
    if (error instanceof AdminAccessError && error.status === 401) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', safeAuthNext(request.nextUrl.pathname))
      denied = NextResponse.redirect(login)
    } else {
      denied = new NextResponse(error instanceof AdminAccessError && error.status === 403 ? 'Page introuvable.' : 'Administration temporairement indisponible.', {
        status: error instanceof AdminAccessError && error.status === 403 ? 404 : 503,
      })
    }
    for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie)
    response = denied
  }
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('Vary', 'Cookie')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  return response
}
// Before every page render (including future children), not only a cached layout.
// API routes require their own validated Bearer token; ambient cookies never suffice.
export const config = { matcher: ['/admin/:path*'] }

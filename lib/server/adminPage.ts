import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { authorizeAdmin, AdminAccessError } from './adminAuthorization'
import { createServerSupabase } from './supabaseSession'

export async function requireAdminPage() {
  try { return await authorizeAdmin(await createServerSupabase()) }
  catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect('/login?next=%2Fadmin')
    if (error instanceof AdminAccessError && error.status === 403) notFound()
    throw new Error('Administration temporairement indisponible.')
  }
}

import type { NextRequest } from 'next/server'
import { authorizeAdmin, createUserAuthClient, AdminAccessError } from '@/lib/server/adminAuthorization'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'
import { adminJson } from '@/lib/server/adminResponses'
import { adminOriginAllowed } from '@/lib/server/adminRequest'
export { adminJson, adminErrorMessage } from '@/lib/server/adminResponses'
export { readJsonObject as readAdminJson } from '@/lib/server/inputValidation'

export async function requireAdmin(request: NextRequest) {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return { error: adminJson({ error: 'Connexion requise.' }, { status: 401 }) }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !adminOriginAllowed(request)) {
    return { error: adminJson({ error: 'Origine refusée.' }, { status: 403 }) }
  }
  try {
    const user = await authorizeAdmin(createUserAuthClient(token), token)
    // Privileged client is created ONLY after user verification and DB membership.
    return { supabaseAdmin: getSupabaseAdminClient(), user }
  } catch (error) {
    return { error: adminJson({ error: error instanceof AdminAccessError ? error.message : 'Administration temporairement indisponible.' },
      { status: error instanceof AdminAccessError ? error.status : 503 }) }
  }
}

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { isAdminEmail } from '@/lib/adminAuth'

// Temporary diagnostics called exclusively by the server authorization guard.
export function logAdminAuthorization(
  request: Request,
  tokenPresent: boolean,
  user: { email?: string | null } | null,
  authError = false,
  supabaseConfigMissing = false,
) {
  const secret = process.env.ADMIN_EMAILS
  let contextAvailable = false
  let contextError = false
  let bindingPresent = false
  let bindingEmpty = false
  let bindingMatchesProcess = false
  try {
    const context = getCloudflareContext()
    contextAvailable = context != null
    const binding = (context?.env as { ADMIN_EMAILS?: unknown } | undefined)?.ADMIN_EMAILS
    bindingPresent = typeof binding === 'string'
    bindingEmpty = typeof binding === 'string' && binding.trim() === ''
    bindingMatchesProcess = typeof binding === 'string' && binding === secret
  } catch {
    contextError = true
  }
  const hostname = new URL(request.url).hostname
  console.warn('[ADMIN_DIAGNOSTIC]', {
    secret_present: typeof secret === 'string',
    secret_empty: typeof secret === 'string' && secret.trim() === '',
    context_available: contextAvailable,
    context_error: contextError,
    context_secret_present: bindingPresent,
    context_secret_empty: bindingEmpty,
    context_secret_matches_process: bindingMatchesProcess,
    token_present: tokenPresent,
    user_present: user != null,
    user_email_present: Boolean(user?.email),
    email_matches_admin: isAdminEmail(user?.email),
    auth_error: authError,
    supabase_config_missing: supabaseConfigMissing,
    apex_host: hostname === 'chibaskogames.fr',
    www_host: hostname === 'www.chibaskogames.fr',
  })
}

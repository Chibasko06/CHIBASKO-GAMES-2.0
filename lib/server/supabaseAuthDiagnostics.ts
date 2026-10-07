// Diagnostic decoding only: never establishes JWT authenticity or authorization.
function jwtPayload(value: string): Record<string, unknown> | null {
  try {
    if (value.length > 32768) return null
    const segment = value.split('.')[1]
    if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) return null
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const payload: unknown = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')))
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function logSupabaseAuthValidation(
  token: string,
  anonKey: string,
  supabaseUrl: string,
  error: { name?: string; status?: number; code?: string } | null,
) {
  // Allowlisted labels only; never copy arbitrary exception text into logs.
  const errorNames = ['AuthApiError', 'AuthSessionMissingError', 'AuthRetryableFetchError',
    'AuthInvalidJwtError', 'AuthUnknownError', 'AuthInvalidTokenResponseError', 'Error']
  const errorCodes = ['bad_jwt', 'session_not_found', 'session_expired', 'user_not_found',
    'jwt_expired', 'no_authorization', 'invalid_credentials', 'unexpected_failure',
    'validation_failed', 'over_request_rate_limit', 'request_timeout', 'user_banned']
  const payload = jwtPayload(token)
  const exp = payload?.exp
  const hasExp = typeof exp === 'number' && Number.isFinite(exp)
  let host: string | null = null
  try { host = new URL(supabaseUrl).hostname } catch { /* Do not log invalid input. */ }
  console.warn('[SUPABASE_AUTH_DIAGNOSTIC]', {
    auth_error_name: error ? (errorNames.includes(error.name ?? '') ? error.name : 'unknown') : null,
    auth_error_status: Number.isInteger(error?.status) && error!.status! >= 0 && error!.status! <= 599
      ? error!.status : null,
    auth_error_code: error?.code ? (errorCodes.includes(error.code) ? error.code : 'unknown') : null,
    token_segment_count: token.split('.').length,
    token_looks_like_jwt: /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token),
    token_has_exp: hasExp,
    ...(hasExp ? { token_expired: exp <= Date.now() / 1000 } : {}),
    anon_key_kind: anonKey.startsWith('sb_publishable_') ? 'publishable'
      : anonKey.split('.').length === 3 && jwtPayload(anonKey)?.role === 'anon' ? 'legacy_anon' : 'unknown',
    supabase_url_host: host,
  })
}

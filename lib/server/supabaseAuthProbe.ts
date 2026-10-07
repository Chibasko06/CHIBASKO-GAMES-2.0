const safePropertyNames = new Set([
  'name', 'message', 'status', 'code', 'cause', '__isAuthError', 'stack',
  'originalError', 'details', 'hint', 'error', 'error_description', 'error_code',
])
const safeConstructors = new Set([
  'Object', 'Array', 'Error', 'TypeError', 'DOMException', 'Promise', 'AuthError',
  'AuthApiError', 'AuthSessionMissingError', 'AuthRetryableFetchError',
  'AuthInvalidJwtError', 'AuthUnknownError', 'AuthInvalidTokenResponseError',
])

export function inspectAuthError(error: unknown) {
  const fields = {
    auth_error_type: typeof error,
    auth_error_is_null: error === null,
    auth_error_truthy: Boolean(error),
    auth_error_instanceof_error: false,
    auth_error_tag: 'unknown',
    auth_error_keys: [] as string[],
    auth_error_own_property_names: [] as string[],
    auth_error_constructor: 'unknown',
    auth_error_has_name: false,
    auth_error_has_message: false,
    auth_error_has_status: false,
    auth_error_has_code: false,
    auth_error_has_cause: false,
    auth_error_has_is_auth_error: false,
    auth_error_inspection_failed: false,
  }
  try {
    fields.auth_error_instanceof_error = error instanceof Error
    const tag = Object.prototype.toString.call(error)
    if (['[object Object]', '[object Error]', '[object Array]', '[object Promise]',
      '[object Null]', '[object Undefined]', '[object String]', '[object Number]',
      '[object Boolean]', '[object Function]', '[object DOMException]'].includes(tag)) {
      fields.auth_error_tag = tag
    }
    if (error !== null && (typeof error === 'object' || typeof error === 'function')) {
      // Unknown property/constructor names could themselves contain sensitive text.
      const namesOnly = (names: string[]) => names.map(name => safePropertyNames.has(name) ? name : '[other]')
      fields.auth_error_keys = namesOnly(Object.keys(error))
      fields.auth_error_own_property_names = namesOnly(Object.getOwnPropertyNames(error))
      fields.auth_error_has_name = 'name' in error
      fields.auth_error_has_message = 'message' in error
      fields.auth_error_has_status = 'status' in error
      fields.auth_error_has_code = 'code' in error
      fields.auth_error_has_cause = 'cause' in error
      fields.auth_error_has_is_auth_error = '__isAuthError' in error
      const prototype = Object.getPrototypeOf(error)
      const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
      const name = typeof constructor === 'function'
        ? Object.getOwnPropertyDescriptor(constructor, 'name')?.value : undefined
      if (typeof name === 'string' && safeConstructors.has(name)) fields.auth_error_constructor = name
    }
  } catch {
    fields.auth_error_inspection_failed = true
  }
  return fields
}

// Request-scoped probe; never patches global fetch or reads headers/response bodies.
export function createSupabaseAuthProbe(supabaseUrl: string, transport: typeof fetch = globalThis.fetch.bind(globalThis)) {
  const diagnosticId = crypto.randomUUID()
  const origin = new URL(supabaseUrl).origin
  const network = {
    auth_user_request_sent: false,
    response_received: false,
    http_status: null as number | null,
    network_exception: false,
  }
  return {
    fetch: (async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const target = url.origin === origin && url.pathname === '/auth/v1/user'
      if (target) network.auth_user_request_sent = true
      let received = false
      let status: number | null = null
      let networkException = false
      try {
        const response = await transport(input, init)
        received = true
        status = response.status
        return response
      } catch (error) {
        networkException = true
        throw error
      } finally {
        if (target) {
          Object.assign(network, {
            response_received: received, http_status: status, network_exception: networkException,
          })
          console.warn('[SUPABASE_AUTH_NETWORK]', { diagnostic_id: diagnosticId, ...network })
        }
      }
    }) as typeof fetch,
    logResult(error: unknown, userPresent: boolean, threw = false) {
      console.warn('[SUPABASE_AUTH_RESULT]', {
        diagnostic_id: diagnosticId,
        get_user_threw: threw,
        user_present: userPresent,
        ...network,
        ...inspectAuthError(error),
      })
    },
  }
}

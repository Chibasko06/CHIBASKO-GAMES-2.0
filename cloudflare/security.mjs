import {securePortalResponse} from '../lib/httpSecurity.mjs'

export function securityHandler(handler) {
  return {
    ...handler,
    async fetch(request, env, ctx) {
      return securePortalResponse(request, await handler.fetch(request, env, ctx))
    },
  }
}

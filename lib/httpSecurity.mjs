export const PORTAL_CSP = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
export const PORTAL_SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': PORTAL_CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
})

const publicHosts = new Set(['chibaskogames.fr', 'www.chibaskogames.fr'])

/** Ajoute le socle du portail sans remplacer les politiques propres aux routes. */
export function securePortalResponse(request, response) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(PORTAL_SECURITY_HEADERS)) {
    if (name === 'Content-Security-Policy') {
      // Plusieurs politiques CSP se cumulent ; aucune règle existante n'est retirée.
      if (!headers.get(name)?.includes(value)) headers.append(name, value)
    } else if (name === 'Referrer-Policy') {
      if (!headers.has(name)) headers.set(name, value)
    } else headers.set(name, value)
  }
  const url = new URL(request.url)
  // Démarrage limité à un jour, sans includeSubDomains ni inscription au preload.
  if (url.protocol === 'https:' && publicHosts.has(url.hostname) && !headers.has('Strict-Transport-Security')) {
    headers.set('Strict-Transport-Security', 'max-age=86400')
  }
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers})
}

import 'server-only'

export function adminOriginAllowed(request: Request) {
  // APIs authenticate explicit Bearer tokens, never ambient cookies.
  // No Origin is valid for non-browser API clients; a supplied Origin must match.
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  return (!origin || origin === new URL(request.url).origin) && (!site || site === 'same-origin' || site === 'none')
}

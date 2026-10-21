// The same Worker serves the public custom domains and protected preview hosts.
const publicHosts = new Set(['chibaskogames.fr', 'www.chibaskogames.fr'])

export function previewHandler(handler) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url)
      // Use the incoming URL, never forwarded headers or the shared canonical URL.
      // Preserve route-specific indexing restrictions returned by the application.
      if (publicHosts.has(url.hostname)) return handler.fetch(request, env, ctx)

      const response = url.pathname === '/robots.txt'
        ? new Response('User-agent: *\nDisallow: /\n', {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
        : await handler.fetch(request, env, ctx)
      const preview = new Response(response.body, response)
      preview.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive')
      return preview
    },
  }
}

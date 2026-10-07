// This entry point belongs exclusively to the separate preview Worker.
export function previewHandler(handler) {
  return {
    async fetch(request, env, ctx) {
      const response = new URL(request.url).pathname === '/robots.txt'
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

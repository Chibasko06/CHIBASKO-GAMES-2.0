import assert from 'node:assert/strict'

const origin = process.argv[2] || 'http://127.0.0.1:8787'
let gamePath
for (const path of [
  '/', '/games', '/players', '/login', '/register', '/auth/callback',
  '/dashboard', '/favorites', '/admin', '/publier-un-jeu', '/faq',
  '/robots.txt', '/sitemap.xml', '/manifest.webmanifest', '/chibaskogames-logo.png',
]) {
  const response = await fetch(new URL(path, origin))
  assert.equal(response.status, 200, path)
  assert.match(response.headers.get('x-robots-tag') || '', /noindex/, path)
  const body = await response.text()
  if (path === '/robots.txt') assert.equal(body, 'User-agent: *\nDisallow: /\n')
  if (path === '/') assert.match(body, /rel="canonical" href="https:\/\/chibaskogames.fr"/)
  if (path === '/sitemap.xml') assert.match(body, /https:\/\/chibaskogames.fr/)
  if (path === '/games') {
    assert.ok(!body.includes('/_next/image?'), 'Cloudflare must serve original images')
    gamePath = body.match(/href="(\/games\/[^"?]+)"/)?.[1]
    assert.ok(gamePath, 'At least one real published game must be rendered')
  }
  console.log(`PASS ${path}: 200, noindex`)
}
const game = await fetch(new URL(gamePath, origin))
assert.equal(game.status, 200, 'Published game page')
assert.match(game.headers.get('x-robots-tag') || '', /noindex/)
console.log('PASS published game detail: 200, noindex')
const adminStatus = await fetch(new URL('/api/admin/status', origin))
assert.equal(adminStatus.status, 200)
assert.deepEqual(await adminStatus.json(), { isAdmin: false })
console.log('PASS /api/admin/status: anonymous visitor is not admin')
for (const path of ['/api/admin/game-submissions']) {
  const response = await fetch(new URL(path, origin))
  assert.equal(response.status, 401, path)
  console.log(`PASS ${path}: unauthorized request rejected`)
}
for (const path of ['/api/game-submissions', '/api/auth/password-reset/request']) {
  const response = await fetch(new URL(path, origin), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })
  assert.equal(response.status, 400, path)
  console.log(`PASS ${path}: invalid request rejected before DB write`)
}

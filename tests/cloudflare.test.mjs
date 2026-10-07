import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { validateGameThumbnail } from '../lib/server/gameThumbnailValidation.ts'
import { passwordResetClientHash } from '../lib/server/passwordReset.ts'
import { previewHandler } from '../cloudflare/preview.mjs'

test('thumbnails retain original bytes and use detected MIME, not filename', async () => {
  const bytes = await readFile(new URL('../public/chibaskogames-logo.png', import.meta.url))
  const result = await validateGameThumbnail(new File([bytes], 'untrusted.svg', { type: 'image/png' }))
  assert.equal(result.contentType, 'image/png')
  assert.equal(result.extension, 'png')
  assert.deepEqual(result.buffer, new Uint8Array(bytes))
  await assert.rejects(validateGameThumbnail(new File([bytes], 'x.png', { type: 'image/jpeg' })))
  await assert.rejects(validateGameThumbnail(new File(['not an image'], 'x.png', { type: 'image/png' })))
  await assert.rejects(validateGameThumbnail(new File([], 'x.png', { type: 'image/png' })))
  await assert.rejects(validateGameThumbnail(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' })))
})

test('static SVG remains supported; active SVG and external resources are rejected', async () => {
  const svg = content => new File([
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${content}</svg>`,
  ], 'image.svg', { type: 'image/svg+xml' })
  assert.equal((await validateGameThumbnail(svg('<rect width="100" height="100" fill="red"/>'))).extension, 'svg')
  for (const unsafe of [
    '<script>alert(1)</script>', '<foreignObject/>', '<rect onload="alert(1)"/>',
    '<image href="https://example.com/image.png"/>', '<animate attributeName="href"/>',
    '<use href="&#106;avascript:alert(1)"/>', '<style>@import "https://example.com";</style>',
  ]) await assert.rejects(validateGameThumbnail(svg(unsafe)))
  await assert.rejects(validateGameThumbnail(new File([
    '<svg xmlns="http://www.w3.org/2000/svg" width="100000" height="100000"/>',
  ], 'large.svg', { type: 'image/svg+xml' })))
})

test('Cloudflare ingress quotas use CF IP and ignore forged forwarded headers', () => {
  const previous = process.env.CHIBASKO_CLOUDFLARE
  process.env.PASSWORD_RESET_CODE_SECRET = 's'.repeat(32)
  process.env.CHIBASKO_CLOUDFLARE = '1'
  try {
    const request = (ip, forwarded) => new Request('https://example.com', {
      headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': forwarded },
    })
    assert.equal(passwordResetClientHash(request('1.2.3.4', '5.6.7.8')), passwordResetClientHash(request('1.2.3.4', '8.7.6.5')))
    assert.notEqual(passwordResetClientHash(request('1.2.3.4', '')), passwordResetClientHash(request('5.6.7.8', '')))
    assert.equal(passwordResetClientHash(request('invalid', '1.2.3.4')), passwordResetClientHash(request('invalid', '5.6.7.8')))
  } finally {
    if (previous === undefined) delete process.env.CHIBASKO_CLOUDFLARE
    else process.env.CHIBASKO_CLOUDFLARE = previous
  }
})

test('preview blocks robots and adds noindex on pages, assets, errors and redirects', async () => {
  let calls = 0
  const handler = previewHandler({ fetch: async request => {
    calls++
    return request.url.endsWith('/redirect')
      ? Response.redirect('https://example.com', 302)
      : new Response('original body', { status: request.url.endsWith('/missing') ? 404 : 200 })
  } })
  for (const path of ['/', '/asset.png', '/missing', '/redirect']) {
    const response = await handler.fetch(new Request(`https://preview.workers.dev${path}`), {}, {})
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive')
    if (path === '/redirect') assert.equal(response.headers.get('location'), 'https://example.com/')
    else assert.equal(await response.text(), 'original body')
  }
  const response = await handler.fetch(new Request('https://preview.workers.dev/robots.txt'), {}, {})
  assert.equal(await response.text(), 'User-agent: *\nDisallow: /\n')
  assert.equal(calls, 4)
})

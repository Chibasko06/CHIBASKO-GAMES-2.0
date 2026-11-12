import { test } from 'node:test'
import assert from 'node:assert/strict'
import { externalGameUrl } from '../lib/game-distribution/external-game-url.ts'
import { externalFramePolicy, legacyFramePolicy } from '../lib/game-runtime/iframePolicy.ts'

test('le sandbox externe reste opaque et la politique legacy est conservée', () => {
  const url = 'https://play.example.com/'
  const external = externalFramePolicy(url)
  assert.equal(external.src, url)
  assert.equal(external.sandbox, 'allow-scripts allow-pointer-lock')
  assert.equal(external.referrerPolicy, 'no-referrer')
  assert.match(external.allow, /camera 'none'/)
  assert.match(legacyFramePolicy(url, 'https://chibaskogames.fr').sandbox, /allow-same-origin/)
})

test('normalise une URL HTTPS déclarée et conserve son origine', () => {
  assert.deepEqual(externalGameUrl('https://PLAY.example.com:443/game/index.html?lang=fr'), {
    url: 'https://play.example.com/game/index.html?lang=fr', origin: 'https://play.example.com',
  })
})

test('refuse les destinations manifestement locales, les IP et les origines de la plateforme', () => {
  for (const value of [
    'http://example.com/', 'https://localhost/', 'https://host.local/', 'https://host.internal/',
    'https://127.1/', 'https://0x7f000001/', 'https://192.168.0.1/', 'https://[::1]/',
    'https://[::ffff:127.0.0.1]/', 'https://169.254.169.254/', 'https://www.chibaskogames.fr/',
    'https://g-fixture.chibaskogames-play.fr/', 'https://user:password@example.com/',
    'https://@example.com/', 'https://example.com:8443/', 'https://example.com./',
    'https://example.com\\@localhost/', 'https://example.com/\n',
  ]) assert.throws(() => externalGameUrl(value), /invalid_external_game_url/, value)
})

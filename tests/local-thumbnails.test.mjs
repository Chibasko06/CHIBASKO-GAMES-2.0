import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { localSource, readLocalThumbnail } from '../scripts/local-thumbnail-source.mjs'
import { migrateRow, targets } from '../scripts/media-migration-core.mjs'
import { options } from '../scripts/migrate-media.mjs'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHsQAAAAASUVORK5CYII=', 'base64')

test('local paths exclude URLs and reject traversal, encoded traversal and Windows paths', () => {
  assert.equal(localSource('https://assets.chibaskogames.fr/a.jpg'), null)
  assert.equal(localSource('//host/a.jpg'), null)
  for (const value of ['/../secret.png', '/%2e%2e/a.png', '/C:/secret.png', '/games/a.png?x=1', '/games\\a.png', '/%2fetc/a.png']) assert.throws(() => localSource(value))
  assert.equal(localSource('/games/a%20b.png').path, 'games/a b.png')
  const config = options(['--local-thumbnails'])
  assert.equal(config.apply, false)
  assert.equal(config.journal, '.media-migration/local-thumbnails.jsonl')
})

test('local dry-run validates bytes without upload, journal or DB; missing and mismatched files fail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chibasko-local-thumbnails-'))
  try {
    const publicDirectory = join(directory, 'public')
    await mkdir(join(publicDirectory, 'games'), { recursive: true })
    await writeFile(join(publicDirectory, 'games', 'valid.png'), png)
    await writeFile(join(publicDirectory, 'games', 'wrong.jpg'), png)
    await writeFile(join(directory, 'outside.png'), png)
    const source = localSource('/games/valid.png')
    const download = item => readLocalThumbnail(publicDirectory, item)
    const forbidden = async () => { assert.fail('dry-run wrote data') }
    const input = { target: targets[1], row: { id: 'game-id', thumbnail_url: '/games/valid.png' }, apply: false, validateDryRun: true, sourceOverride: source, download, objects: { ensure: forbidden, read: forbidden }, update: forbidden, journal: forbidden }
    assert.equal(await migrateRow(input), 'planned')
    await assert.rejects(download(localSource('/games/missing.png')))
    await assert.rejects(download(localSource('/games/wrong.jpg')), /extension-mismatch/)
    await assert.rejects(download({ path: '../outside.png' }), /outside-public/)
    await writeFile(join(publicDirectory, 'games', 'active.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>')
    await assert.rejects(migrateRow({ ...input, sourceOverride: localSource('/games/active.svg') }))
    let written, saved = false
    const entries = []
    const objects = {
      ensure: async (key, bytes, contentType, metadata) => { written = { key, bytes, contentType, metadata } },
      read: async () => { assert.equal(saved, false); return written },
    }
    assert.equal(await migrateRow({ ...input, apply: true, objects, journal: async e => entries.push(e), update: async (_t, _id, oldUrl, nextUrl) => {
      assert.equal(oldUrl, '/games/valid.png')
      assert.ok(entries.some(e => e.state === 'prepared'))
      assert.match(nextUrl, /^https:\/\/assets.chibaskogames.fr\/game-thumbnails\/[\da-f-]+\.png$/)
      saved = true; return true
    } }), 'success')
    assert.deepEqual(written.bytes, new Uint8Array(png))
    assert.match(written.key, /^game-thumbnails\/[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.png$/)
  } finally {
    const absolute = resolve(directory)
    assert.ok(absolute.startsWith(resolve(tmpdir()) + sep))
    assert.ok(absolute.includes('chibasko-local-thumbnails-'))
    await rm(absolute, { recursive: true, force: true })
  }
})

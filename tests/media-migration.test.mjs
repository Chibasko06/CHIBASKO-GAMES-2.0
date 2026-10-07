import test from 'node:test'
import assert from 'node:assert/strict'
import { classify, migrateRow, rollbackEntry, targets, origin } from '../scripts/media-migration-core.mjs'
import { options } from '../scripts/migrate-media.mjs'

const supabaseUrl = 'https://test.supabase.co'
const id = '12345678-1234-4234-8234-123456789abc'
const bytes = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHsQAAAAASUVORK5CYII=', 'base64'))
const oldUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${id}/avatar.png`

function fixture(target = targets[0]) {
  const saved = new Map(), entries = [], events = []
  let current = oldUrl
  return {
    saved, entries, events, current: () => current,
    input: { target, row: { id, [target.column]: oldUrl }, supabaseUrl, apply: true,
      download: async () => { events.push('download'); return bytes },
      objects: {
        ensure: async (key, value, contentType, metadata) => {
          events.push('put')
          if (!saved.has(key)) saved.set(key, { bytes: value, contentType, metadata: Object.fromEntries(Object.entries(metadata).map(([k, v]) => [k.toLowerCase(), v])) })
        },
        read: async key => { events.push('verify'); return saved.get(key) },
      },
      update: async (_target, _id, previous, next) => { events.push('update'); if (current !== previous) return false; current = next; return true },
      journal: async entry => { events.push(entry.state); entries.push(entry) },
    },
  }
}

test('CLI defaults safe; unknown/conflicting flags rejected', () => {
  assert.equal(options([]).apply, false)
  assert.equal(options(['--apply']).apply, true)
  assert.throws(() => options(['--apply', '--dry-run']))
  assert.throws(() => options(['--unknown']))
})

test('URL inventory only accepts public Storage paths from configured project and known buckets', () => {
  assert.equal(classify(oldUrl, supabaseUrl).state, 'candidate')
  assert.equal(classify(`${origin}/avatars/x.png`, supabaseUrl).state, 'already-r2')
  assert.equal(classify('https://other.supabase.co/storage/v1/object/public/avatars/a.png', supabaseUrl).state, 'external')
  assert.equal(classify(`${oldUrl}?token=secret`, supabaseUrl).state, 'unsupported-supabase')
  assert.equal(classify(oldUrl.replace('avatar.png', '%2e%2e%2Fa.png'), supabaseUrl).state, 'invalid')
  assert.equal(classify('not a url', supabaseUrl).state, 'invalid')
  assert.equal(classify('/images/local.png', supabaseUrl).state, 'local')
})

test('dry-run performs no download, R2, journal or database writes', async () => {
  const f = fixture()
  assert.equal(await migrateRow({ ...f.input, apply: false }), 'planned')
  assert.deepEqual(f.events, [])
})

for (const target of targets) {
  test(`${target.prefix}: copy original bytes, verify before DB, deterministic reusable key`, async () => {
    const f = fixture(target)
    assert.equal(await migrateRow(f.input), 'success')
    assert.deepEqual(f.events, ['download', 'put', 'verify', 'prepared', 'update', 'committed'])
    const key = [...f.saved.keys()][0]
    assert.match(key, target.prefix === 'avatars' ? /^avatars\/[\da-f-]+\/[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}\.png$/ : /^game-thumbnails\/[\da-f-]+\.png$/)
    assert.deepEqual(f.saved.get(key).bytes, bytes)
    assert.equal(f.current(), `${origin}/${key}`)
    assert.equal(await migrateRow(f.input), 'conflict')
    assert.equal(f.saved.size, 1)
    assert.equal(await migrateRow({ ...f.input, row: { id, [target.column]: f.current() } }), 'already-r2')
  })
}

test('DB failure followed by retry reuses copied object and retains source URL', async () => {
  const f = fixture()
  await assert.rejects(migrateRow({ ...f.input, update: async () => { throw new Error('DB failed') } }))
  assert.equal(f.current(), oldUrl)
  assert.equal(await migrateRow(f.input), 'success')
  assert.equal(f.saved.size, 1)
})

test('corrupt R2 read-back, failed upload or failed journal never update DB', async () => {
  for (const fault of ['verify', 'put', 'journal']) {
    const f = fixture()
    if (fault === 'verify') f.input.objects.read = async () => ({ bytes: new Uint8Array(), contentType: 'image/png', metadata: {} })
    if (fault === 'put') f.input.objects.ensure = async () => { throw new Error('write failed') }
    if (fault === 'journal') f.input.journal = async () => { throw new Error('journal-failed') }
    await assert.rejects(migrateRow(f.input))
    assert.equal(f.current(), oldUrl)
    assert.ok(!f.events.includes('update'))
  }
})

test('unsupported images and active SVG are rejected before copying', async () => {
  const f = fixture(targets[1])
  f.input.download = async () => new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>')
  await assert.rejects(migrateRow(f.input))
  assert.ok(!f.events.includes('put'))
})

test('rollback is dry-run by default and only restores the exact migrated URL', async () => {
  const f = fixture()
  await migrateRow(f.input)
  const entry = f.entries[0]
  const input = { target: targets[0], entry, update: f.input.update, journal: f.input.journal }
  const migrated = f.current()
  assert.equal(await rollbackEntry({ ...input, apply: false }), 'planned')
  assert.equal(f.current(), migrated)
  assert.equal(await rollbackEntry({ ...input, apply: true }), 'success')
  assert.equal(f.current(), oldUrl)
  assert.equal(await rollbackEntry({ ...input, apply: true }), 'skipped')
  assert.equal(f.saved.size, 1)
})

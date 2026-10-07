import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { uploadGameThumbnail, cleanupReplacedGameThumbnail } from '../lib/server/gameMediaStorage.ts'
import { managedImageKey } from '../lib/server/r2Assets.ts'
import { POST as uploadRoute } from '../app/api/admin/games/thumbnail/route.ts'
import { PATCH as patchGame } from '../app/api/admin/games/[id]/route.ts'

const key = 'game-thumbnails/11111111-1111-4111-8111-111111111111.png'
const oldUrl = `https://assets.chibaskogames.fr/${key}`
const newUrl = 'https://assets.chibaskogames.fr/game-thumbnails/22222222-2222-4222-8222-222222222222.png'
const png = await readFile(new URL('../public/chibaskogames-logo.png', import.meta.url))
const validImage = () => new File([png], 'ignored.jpg', { type: 'image/png' })

function database(options = {}) {
  return {
    from(table) {
      return {
        select(_columns, selection) {
          if (selection?.head) return { ilike: async () => {
            globalThis.__r2.events.push(`reference-check:${table}`)
            return options.references?.[table] || { count: 0, error: null }
          } }
          return { eq: () => ({ single: async () => ({
            data: { thumbnail_url: options.previous ?? oldUrl }, error: options.readError || null,
          }) }) }
        },
        update(payload) {
          const chain = {
            eq(column, value) { globalThis.__r2.events.push(['eq', column, value]); return chain },
            is(column, value) { globalThis.__r2.events.push(['is', column, value]); return chain },
            select() { return chain },
            async single() {
              globalThis.__r2.events.push('save-game')
              return { data: { id: 'game-id', ...payload }, error: options.saveError || null }
            },
          }
          return chain
        },
        delete: () => ({ eq: async () => {
          globalThis.__r2.events.push('save-categories')
          return { error: options.categoryError || null }
        } }),
        insert: async () => ({ error: options.categoryError || null }),
      }
    },
  }
}

beforeEach(() => {
  globalThis.__r2 = {
    events: [],
    bucket: {
      put: async (...args) => { globalThis.__r2.events.push(['put', ...args]); return { key: args[0] } },
      head: async () => ({ customMetadata: { application: 'chibasko-games', kind: 'game-thumbnails' } }),
      delete: async key => { globalThis.__r2.events.push(['delete', key]) },
    },
    adminCheck: async () => ({ supabaseAdmin: database(), user: { id: 'admin' } }),
  }
})

test('valid thumbnail uploads original bytes to R2 with immutable metadata and unique key', async () => {
  const url = await uploadGameThumbnail(validImage())
  assert.match(url, /^https:\/\/assets\.chibaskogames\.fr\/game-thumbnails\/[0-9a-f-]{36}\.png$/)
  const [operation, uploadedKey, bytes, options] = globalThis.__r2.events[0]
  assert.equal(operation, 'put')
  assert.equal(uploadedKey, new URL(url).pathname.slice(1))
  assert.deepEqual(bytes, new Uint8Array(png))
  assert.equal(options.onlyIf.get('if-none-match'), '*')
  assert.equal(options.httpMetadata.contentType, 'image/png')
  assert.equal(options.httpMetadata.cacheControl, 'public, max-age=31536000, immutable')
  assert.deepEqual(options.customMetadata, { application: 'chibasko-games', kind: 'game-thumbnails' })
  assert.notEqual(await uploadGameThumbnail(validImage()), url)
})

test('invalid image never accesses R2; missing binding and failed writes never fallback to Supabase', async () => {
  await assert.rejects(uploadGameThumbnail(new File(['bad'], 'x.png', { type: 'image/png' })))
  assert.deepEqual(globalThis.__r2.events, [])
  const bucket = globalThis.__r2.bucket
  globalThis.__r2.bucket = undefined
  await assert.rejects(uploadGameThumbnail(validImage()), /CHIBASKO_ASSETS/)
  globalThis.__r2.bucket = bucket
  bucket.put = async () => null
  await assert.rejects(uploadGameThumbnail(validImage()), /creer/)
  bucket.put = async () => { throw new Error('R2 failure') }
  await assert.rejects(uploadGameThumbnail(validImage()), /R2 failure/)
})

test('cleanup recognizes only canonical owned thumbnail URLs', () => {
  assert.equal(managedImageKey(oldUrl, 'game-thumbnails'), key)
  for (const url of [null, 'bad', oldUrl + '?v=1', oldUrl + '#fragment',
    oldUrl.replace('https:', 'http:'), oldUrl.replace('assets.', 'assets.evil.'),
    oldUrl.replace('https://', 'https://user:pass@'), oldUrl.replace('game-thumbnails/', 'avatars/'),
    oldUrl.replace('11111111-1111-4111-8111-111111111111', 'manual'),
    oldUrl.replace('assets.chibaskogames.fr', 'project.supabase.co')]) {
    assert.equal(managedImageKey(url, 'game-thumbnails'), null)
  }
})

test('cleanup preserves unchanged, Supabase, foreign, shared and unmanaged objects', async () => {
  const remove = async (previous, next, db = database()) => {
    globalThis.__r2.events = []
    await cleanupReplacedGameThumbnail(previous, next, db)
    assert.ok(!globalThis.__r2.events.some(event => event[0] === 'delete'))
  }
  await remove(oldUrl, oldUrl)
  await remove('https://project.supabase.co/storage/v1/object/public/game-thumbnails/x.png', newUrl)
  await remove('https://example.com/x.png', newUrl)
  for (const table of ['games', 'profiles']) {
    await remove(oldUrl, newUrl, database({ references: { [table]: { count: 1, error: null } } }))
    await remove(oldUrl, newUrl, database({ references: { [table]: { count: null, error: new Error('DB failed') } } }))
  }
  globalThis.__r2.bucket.head = async () => ({ customMetadata: {} })
  await remove(oldUrl, newUrl)
})

test('cleanup deletes an owned unreferenced old R2 object, never the new key', async () => {
  await cleanupReplacedGameThumbnail(oldUrl, newUrl, database())
  assert.deepEqual(globalThis.__r2.events.at(-1), ['delete', key])
})

test('upload route preserves admin guard and returns the R2 URL without saving the game', async () => {
  const form = new FormData()
  form.set('file', validImage())
  const request = () => new Request('https://example.com/api/admin/games/thumbnail', { method: 'POST', body: form })
  globalThis.__r2.adminCheck = async () => ({ error: new Response(null, { status: 403 }) })
  assert.equal((await uploadRoute(request())).status, 403)
  assert.deepEqual(globalThis.__r2.events, [])
  globalThis.__r2.adminCheck = async () => ({ supabaseAdmin: database(), user: { id: 'admin' } })
  const response = await uploadRoute(request())
  assert.equal(response.status, 200)
  assert.match((await response.json()).thumbnailUrl, /^https:\/\/assets\.chibaskogames\.fr\//)
  assert.equal(globalThis.__r2.events.length, 1)
})

const saveRequest = () => new Request('https://example.com/api/admin/games/game-id', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Game', thumbnail_url: newUrl, category_ids: [] }),
})
const params = { params: Promise.resolve({ id: 'game-id' }) }

test('PATCH saves game and categories before cleanup and protects against concurrent changes', async () => {
  const response = await patchGame(saveRequest(), params)
  assert.equal(response.status, 200)
  const events = globalThis.__r2.events
  assert.ok(events.indexOf('save-game') < events.indexOf('save-categories'))
  assert.ok(events.indexOf('save-categories') < events.indexOf('reference-check:games'))
  assert.deepEqual(events.at(-1), ['delete', key])
  assert.ok(events.some(event => Array.isArray(event) && event[0] === 'eq' && event[1] === 'thumbnail_url' && event[2] === oldUrl))
})

test('PATCH never deletes on read failure, save failure, concurrent conflict or category failure', async () => {
  for (const options of [
    { readError: { message: 'read failed' } },
    { saveError: { message: 'save failed' } },
    { saveError: { message: 'concurrent change', code: 'PGRST116' } },
    { categoryError: { message: 'category failed' } },
  ]) {
    globalThis.__r2.events = []
    globalThis.__r2.adminCheck = async () => ({ supabaseAdmin: database(options) })
    const response = await patchGame(saveRequest(), params)
    assert.equal(response.status, options.saveError?.code === 'PGRST116' ? 409 : 500)
    assert.ok(!globalThis.__r2.events.some(event => event[0] === 'delete'))
  }
})

test('R2 cleanup failure does not fail a saved game', async () => {
  globalThis.__r2.bucket.delete = async () => { throw new Error('delete failed') }
  assert.equal((await patchGame(saveRequest(), params)).status, 200)
})

test('actual local R2 binding stores bytes and metadata, rejects overwrites and cleans replaced objects', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chibasko-r2-test-'))
  let platform
  try {
    const configPath = join(directory, 'wrangler.json')
    await writeFile(configPath, JSON.stringify({
      name: 'chibasko-r2-test-local', compatibility_date: '2026-10-07',
      compatibility_flags: ['nodejs_compat'],
      r2_buckets: [{ binding: 'CHIBASKO_ASSETS', bucket_name: 'chibasko-r2-test-local', remote: false }],
    }))
    platform = await getPlatformProxy({ configPath, persist: false })
    globalThis.__r2.bucket = platform.env.CHIBASKO_ASSETS
    const url = await uploadGameThumbnail(validImage())
    const storedKey = new URL(url).pathname.slice(1)
    const object = await platform.env.CHIBASKO_ASSETS.get(storedKey)
    assert.deepEqual(new Uint8Array(await object.arrayBuffer()), new Uint8Array(png))
    assert.equal(object.httpMetadata.contentType, 'image/png')
    assert.deepEqual(object.customMetadata, { application: 'chibasko-games', kind: 'game-thumbnails' })
    const collision = await platform.env.CHIBASKO_ASSETS.put(storedKey, new Uint8Array([1]), {
      onlyIf: new Headers({ 'If-None-Match': '*' }),
    })
    assert.equal(collision, null)
    await cleanupReplacedGameThumbnail(url, newUrl, database())
    assert.equal(await platform.env.CHIBASKO_ASSETS.head(storedKey), null)
  } finally {
    await platform?.dispose()
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('chibasko-r2-test-'))
    await rm(directory, { recursive: true, force: true })
  }
})

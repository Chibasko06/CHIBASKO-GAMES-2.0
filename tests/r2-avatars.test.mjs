import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getPlatformProxy } from 'wrangler'
import { uploadAvatarForUser, replaceAvatarForUser, updateAvatarForUser, cleanupReplacedAvatar } from '../lib/server/avatarStorage.ts'
import { managedImageKey } from '../lib/server/r2Assets.ts'
import { POST as ownUpload, DELETE as ownDelete } from '../app/api/profile/avatar/route.ts'
import { POST as adminUpload } from '../app/api/admin/users/[id]/avatar/route.ts'
import { PATCH as adminPatch } from '../app/api/admin/users/[id]/route.ts'

const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const key = `avatars/${owner}/11111111-1111-4111-8111-111111111111.png`
const oldUrl = `https://assets.chibaskogames.fr/${key}`
const png = await readFile(new URL('../public/chibaskogames-logo.png', import.meta.url))
const image = () => new File([png], 'untrusted.svg', { type: 'image/png' })
let events

function database(options = {}) {
  return {
    auth: { getUser: async token => {
      events.push(['auth', token === 'test-token'])
      return { data: { user: options.noUser ? null : { id: owner } }, error: options.authError || null }
    } },
    from(table) {
      return {
        select(_columns, selection) {
          if (selection?.head) return { ilike: async () => {
            events.push(['references', table])
            return options.references?.[table] || { count: 0, error: null }
          } }
          return { eq: (_column, id) => ({ single: async () => {
            events.push(['read', id])
            return { data: { avatar_url: options.previous === undefined ? oldUrl : options.previous }, error: options.readError || null }
          } }) }
        },
        update(payload) {
          const chain = {
            eq(column, value) { events.push(['eq', column, value]); return chain },
            is(column, value) { events.push(['is', column, value]); return chain },
            select() { return chain },
            single: async () => {
              events.push(['save', payload])
              return { data: { id: owner, username: 'player', display_name: 'player', bio: null,
                created_at: '', ...payload }, error: options.saveError || null }
            },
          }
          return chain
        },
      }
    },
  }
}

beforeEach(() => {
  events = []
  globalThis.__r2 = {
    bucket: {
      put: async (key, bytes, options) => { events.push(['put', key, bytes, options]); return { key } },
      head: async key => {
        events.push(['head', key])
        return { customMetadata: { application: 'chibasko-games', kind: 'avatars', userId: owner } }
      },
      delete: async key => { events.push(['delete', key]) },
    },
    adminCheck: async () => ({ supabaseAdmin: globalThis.__phase0.admin, user: { id: other } }),
  }
  globalThis.__phase0 = { admin: database() }
})

const deleted = () => events.filter(event => event[0] === 'delete')
function request(method = 'POST', token = 'test-token') {
  const form = new FormData()
  form.append('file', image())
  form.append('userId', other)
  return new Request('https://example.test/api/profile/avatar', {
    method, headers: token ? { Authorization: `Bearer ${token}` } : {},
    ...(method === 'POST' ? { body: form } : {}),
  })
}

test('avatars upload original bytes using unique owner-scoped R2 keys and MIME metadata', async () => {
  const url = await uploadAvatarForUser(owner, image())
  assert.match(url, new RegExp(`^https://assets\\.chibaskogames\\.fr/avatars/${owner}/[0-9a-f-]{36}\\.png$`))
  const [, uploadedKey, bytes, options] = events[0]
  assert.equal(url, `https://assets.chibaskogames.fr/${uploadedKey}`)
  assert.deepEqual(bytes, new Uint8Array(png))
  assert.equal(options.httpMetadata.contentType, 'image/png')
  assert.equal(options.httpMetadata.cacheControl, 'public, max-age=31536000, immutable')
  assert.equal(options.onlyIf.get('if-none-match'), '*')
  assert.deepEqual(options.customMetadata, { application: 'chibasko-games', kind: 'avatars', userId: owner })
  assert.notEqual(await uploadAvatarForUser(owner, image()), url)
  await assert.rejects(uploadAvatarForUser('../other', image()))
})

test('avatar validation enforces 5 MB, original formats, detected MIME and bounded dimensions; SVG stays rejected', async () => {
  const huge = Buffer.from(png)
  huge.writeUInt32BE(100000, 16)
  huge.writeUInt32BE(100000, 20)
  for (const file of [
    new File([], 'x.png', { type: 'image/png' }),
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }),
    new File(['not an image'], 'x.png', { type: 'image/png' }),
    new File([png], 'x.jpg', { type: 'image/jpeg' }),
    new File([huge], 'x.png', { type: 'image/png' }),
    new File(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'], 'x.svg', { type: 'image/svg+xml' }),
  ]) await assert.rejects(uploadAvatarForUser(owner, file), error => error.status === 400)
  assert.deepEqual(events, [])
  const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE9sAAAAASUVORK5CYII=', 'base64')
  const ico = Buffer.alloc(22 + tinyPng.length)
  ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4)
  ico[6] = 1; ico[7] = 1
  ico.writeUInt32LE(tinyPng.length, 14); ico.writeUInt32LE(22, 18)
  tinyPng.copy(ico, 22)
  for (const type of ['image/x-icon', 'image/vnd.microsoft.icon']) {
    assert.match(await uploadAvatarForUser(owner, new File([ico], 'x.ico', { type })), /\.ico$/)
  }
})

test('replacing an avatar saves with a compare-and-swap before deleting the previous R2 object', async () => {
  const profile = await replaceAvatarForUser(owner, image(), database())
  assert.notEqual(profile.avatar_url, oldUrl)
  assert.ok(events.findIndex(e => e[0] === 'put') < events.findIndex(e => e[0] === 'save'))
  assert.ok(events.findIndex(e => e[0] === 'save') < events.findIndex(e => e[0] === 'delete'))
  assert.ok(events.some(e => e[0] === 'eq' && e[1] === 'avatar_url' && e[2] === oldUrl))
  assert.deepEqual(deleted(), [['delete', key]])
})

test('legacy Supabase, external, foreign-owner and malformed URLs are never deleted', async () => {
  for (const previous of [
    'https://project.supabase.co/storage/v1/object/public/avatars/user/avatar.png',
    'https://example.test/avatar.png', oldUrl.replace(owner, other),
    `${oldUrl}?v=1`, `${oldUrl}#x`, oldUrl.replace('https:', 'http:'),
    oldUrl.replace('/avatars/', '/avatars/%2e%2e/'),
  ]) {
    events = []
    assert.equal(managedImageKey(previous, 'avatars', owner), null)
    await replaceAvatarForUser(owner, image(), database({ previous }))
    assert.deepEqual(deleted(), [])
    assert.ok(!events.some(e => e[0] === 'head'))
  }
})

test('avatar deletion clears the database before removing R2; legacy files are retained', async () => {
  const profile = await updateAvatarForUser(owner, null, database())
  assert.equal(profile.avatar_url, null)
  assert.deepEqual(deleted(), [['delete', key]])
  assert.ok(events.findIndex(e => e[0] === 'save') < events.findIndex(e => e[0] === 'delete'))
  events = []
  await updateAvatarForUser(owner, null, database({ previous: 'https://project.supabase.co/old.png' }))
  assert.deepEqual(deleted(), [])
})

test('DB errors and concurrent saves never delete an old object; failed reads prevent uploads', async () => {
  for (const options of [{ readError: {} }, { saveError: {} }, { saveError: { code: 'PGRST116' } }]) {
    events = []
    await assert.rejects(replaceAvatarForUser(owner, image(), database(options)))
    assert.deepEqual(deleted(), [])
    if (options.readError) assert.ok(!events.some(e => e[0] === 'put'))
    events = []
    await assert.rejects(updateAvatarForUser(owner, null, database(options)))
    assert.deepEqual(deleted(), [])
  }
})

test('cleanup retains unchanged, referenced, unowned objects and tolerates R2 failures', async () => {
  await cleanupReplacedAvatar(owner, oldUrl, oldUrl, database())
  assert.deepEqual(events, [])
  for (const references of [{ profiles: { count: 1 } }, { games: { count: 1 } },
    { profiles: { count: null, error: {} } }]) {
    await cleanupReplacedAvatar(owner, oldUrl, null, database({ references }))
    assert.deepEqual(deleted(), [])
  }
  globalThis.__r2.bucket.head = async () => ({ customMetadata: { application: 'other' } })
  await cleanupReplacedAvatar(owner, oldUrl, null, database())
  assert.deepEqual(deleted(), [])
  globalThis.__r2.bucket.head = async () => { throw new Error('R2 failure') }
  const profile = await updateAvatarForUser(owner, null, database())
  assert.equal(profile.avatar_url, null)
})

test('own avatar POST and DELETE require verified Auth and ignore client-supplied owner IDs', async () => {
  assert.equal((await ownUpload(request('POST', null))).status, 401)
  assert.equal((await ownDelete(request('DELETE', null))).status, 401)
  globalThis.__phase0.admin = database({ noUser: true })
  assert.equal((await ownUpload(request())).status, 401)
  assert.equal((await ownDelete(request('DELETE'))).status, 401)
  assert.ok(!events.some(e => e[0] === 'put' || e[0] === 'save'))
  globalThis.__phase0.admin = database({ previous: null })
  const response = await ownUpload(request())
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.profile.avatar_url, payload.avatarUrl)
  assert.ok(payload.avatarUrl.includes(`/avatars/${owner}/`))
  assert.ok(!events.some(e => e[0] === 'eq' && e[1] === 'id' && e[2] === other))
  assert.equal((await ownDelete(request('DELETE'))).status, 200)
})

test('admin upload and profile PATCH preserve the admin guard; clearing the URL cleans R2 after save', async () => {
  const params = { params: Promise.resolve({ id: owner }) }
  globalThis.__r2.adminCheck = async () => ({ error: Response.json({ error: 'Forbidden' }, { status: 403 }) })
  assert.equal((await adminUpload(request(), params)).status, 403)
  assert.equal((await adminPatch(new Request('https://example.test'), params)).status, 403)
  assert.deepEqual(events, [])
  globalThis.__r2.adminCheck = async () => ({ supabaseAdmin: database() })
  assert.equal((await adminUpload(request(), params)).status, 200)
  events = []
  const response = await adminPatch(new Request('https://example.test', {
    method: 'PATCH', body: JSON.stringify({ username: 'player', bio: 'bio', avatar_url: '' }),
  }), params)
  assert.equal(response.status, 200)
  assert.equal((await response.json()).user.avatar_url, null)
  assert.deepEqual(deleted(), [['delete', key]])
})

test('R2 upload failures and DB conflicts return errors without deleting existing avatars', async () => {
  const bucket = globalThis.__r2.bucket
  globalThis.__r2.bucket = undefined
  assert.equal((await ownUpload(request())).status, 500)
  globalThis.__r2.bucket = bucket
  globalThis.__phase0.admin = database({ saveError: { code: 'PGRST116' } })
  assert.equal((await ownUpload(request())).status, 409)
  assert.equal((await ownDelete(request('DELETE'))).status, 409)
  assert.deepEqual(deleted(), [])
})

test('local Workers R2 binding stores avatars and deletes owned objects only after a saved profile', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chibasko-avatar-test-'))
  let platform
  try {
    const configPath = join(directory, 'wrangler.json')
    await writeFile(configPath, JSON.stringify({
      name: 'chibasko-avatar-local', compatibility_date: '2026-10-07', compatibility_flags: ['nodejs_compat'],
      r2_buckets: [{ binding: 'CHIBASKO_ASSETS', bucket_name: 'chibasko-avatar-local', remote: false }],
    }))
    platform = await getPlatformProxy({ configPath, persist: false })
    globalThis.__r2.bucket = platform.env.CHIBASKO_ASSETS
    const profile = await replaceAvatarForUser(owner, image(), database({ previous: null }))
    const storedKey = managedImageKey(profile.avatar_url, 'avatars', owner)
    const object = await platform.env.CHIBASKO_ASSETS.get(storedKey)
    assert.deepEqual(new Uint8Array(await object.arrayBuffer()), new Uint8Array(png))
    assert.equal(object.customMetadata.userId, owner)
    await updateAvatarForUser(owner, null, database({ previous: profile.avatar_url }))
    assert.equal(await platform.env.CHIBASKO_ASSETS.head(storedKey), null)
  } finally {
    await platform?.dispose()
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    assert.ok(basename(directory).startsWith('chibasko-avatar-test-'))
    await rm(directory, { recursive: true, force: true })
  }
})

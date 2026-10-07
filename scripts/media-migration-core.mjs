import { createHash } from 'node:crypto'
import { imageSize } from 'image-size'
import { validateGameThumbnail } from '../lib/server/gameThumbnailValidation.ts'

export const origin = 'https://assets.chibaskogames.fr'
export const targets = [
  { table: 'profiles', column: 'avatar_url', prefix: 'avatars' },
  { table: 'games', column: 'thumbnail_url', prefix: 'game-thumbnails' },
]
export const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export function classify(value, supabaseUrl) {
  if (value === null || value === '') return { state: 'empty' }
  if (typeof value !== 'string') return { state: 'invalid' }
  let url
  try { url = new URL(value) } catch { return { state: value.startsWith('/') ? 'local' : 'invalid' } }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return { state: 'invalid' }
  if (url.origin === origin) return { state: 'already-r2' }
  if (url.origin !== new URL(supabaseUrl).origin) return { state: 'external' }
  const match = /^\/storage\/v1\/object\/public\/(avatars|game-thumbnails)\/(.+)$/.exec(url.pathname)
  if (!match || url.search || url.hash) return { state: 'unsupported-supabase' }
  try {
    const path = decodeURIComponent(match[2])
    if (path.split('/').some(p => !p || p === '.' || p === '..') || /[\\\u0000-\u001f]/.test(path)) return { state: 'invalid' }
    return { state: 'candidate', bucket: match[1], path }
  } catch { return { state: 'invalid' } }
}

export async function prepare(bytes, target, id) {
  const dimensions = imageSize(bytes)
  const extension = dimensions.type
  const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml' }[extension]
  if (target.prefix === 'avatars') {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id)) throw new Error('invalid-owner')
    if (!['jpg', 'png', 'webp', 'gif', 'ico'].includes(extension) || !bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('invalid-avatar')
    const sizes = dimensions.images || [dimensions]
    if (sizes.some(d => !d.width || !d.height || d.width * d.height > 40_000_000)) throw new Error('invalid-dimensions')
  } else {
    await validateGameThumbnail(new File([bytes], 'source', { type: mime || '' }))
  }
  return { extension, contentType: mime, digest: hash(bytes) }
}

export function destination(target, id, source, image) {
  // Stable identifier with UUID-v4 syntax, compatible with existing cleanup helpers.
  const hex = hash(JSON.stringify(['supabase-media-v1', target.prefix, target.prefix === 'avatars' ? id : '', source.bucket, source.path, image.digest])).slice(0, 32).split('')
  hex[12] = '4'
  hex[16] = (8 + (parseInt(hex[16], 16) % 4)).toString(16)
  const h = hex.join('')
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
  return `${target.prefix}/${target.prefix === 'avatars' ? `${id}/` : ''}${uuid}.${image.extension}`
}

export async function migrateRow({ target, row, supabaseUrl, apply, download, objects, update, journal, sourceOverride, validateDryRun = false }) {
  const source = sourceOverride || classify(row[target.column], supabaseUrl)
  if (source.state !== 'candidate') return source.state
  if (!apply && !validateDryRun) return 'planned'
  const bytes = await download(source)
  const image = await prepare(bytes, target, row.id)
  if (!apply) return 'planned'
  const key = destination(target, row.id, source, image)
  const metadata = { application: 'chibasko-games', kind: target.prefix, migration: 'supabase-media-v1', sha256: image.digest, ...(target.prefix === 'avatars' ? { userId: row.id } : {}) }
  await objects.ensure(key, bytes, image.contentType, metadata)
  const verified = await objects.read(key)
  if (hash(verified.bytes) !== image.digest || verified.contentType !== image.contentType || Object.entries(metadata).some(([k, v]) => verified.metadata[k.toLowerCase()] !== v)) throw new Error('verification-failed')
  const entry = { table: target.table, column: target.column, id: row.id, oldUrl: row[target.column], newUrl: `${origin}/${key}`, key, sha256: image.digest }
  // Durable intent before DB: also recovers a crash immediately after the update.
  await journal({ ...entry, state: 'prepared' })
  const changed = await update(target, row.id, entry.oldUrl, entry.newUrl)
  await journal({ ...entry, state: changed ? 'committed' : 'conflict' })
  return changed ? 'success' : 'conflict'
}

export async function rollbackEntry({ target, entry, apply, update, journal }) {
  if (!apply) return 'planned'
  const changed = await update(target, entry.id, entry.newUrl, entry.oldUrl)
  await journal({ ...entry, state: changed ? 'rolled-back' : 'rollback-conflict' })
  return changed ? 'success' : 'skipped'
}

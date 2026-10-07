import { realpath, open } from 'node:fs/promises'
import { resolve, relative, isAbsolute, extname, sep } from 'node:path'
import { imageSize } from 'image-size'

export function localSource(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  if (/[?#\\\u0000-\u001f]/.test(value)) throw new Error('invalid-local-path')
  let decoded
  try { decoded = decodeURIComponent(value.slice(1)) } catch { throw new Error('invalid-local-path') }
  if (/[\\:\u0000-\u001f]/.test(decoded) || decoded.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('invalid-local-path')
  return { state: 'candidate', bucket: 'repo-local', path: decoded }
}

export async function readLocalThumbnail(publicDirectory, source) {
  const root = await realpath(publicDirectory)
  const file = await realpath(resolve(root, source.path))
  const inside = relative(root, file)
  if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith(`..${sep}`)) throw new Error('outside-public')
  const handle = await open(file, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || !info.size || info.size > 8 * 1024 * 1024) throw new Error('invalid-file-size')
    const bytes = new Uint8Array(await handle.readFile())
    const type = imageSize(bytes).type
    const extension = extname(source.path).slice(1).toLowerCase()
    if ((extension === 'jpeg' ? 'jpg' : extension) !== type) throw new Error('extension-mismatch')
    return bytes
  } finally { await handle.close() }
}

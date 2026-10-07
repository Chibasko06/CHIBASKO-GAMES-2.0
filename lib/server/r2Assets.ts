import { getCloudflareContext } from '@opennextjs/cloudflare'

export const PUBLIC_ASSET_ORIGIN = 'https://assets.chibaskogames.fr'
const cacheControl = 'public, max-age=31536000, immutable'
const ownerIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export type AssetsBucket = {
  put(key: string, value: Uint8Array, options: {
    onlyIf: Headers
    httpMetadata: { contentType: string; cacheControl: string }
    customMetadata: Record<string, string>
  }): Promise<unknown | null>
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>
  delete(key: string): Promise<void>
}

export function getR2AssetsBucket(): AssetsBucket {
  try {
    const context = getCloudflareContext()
    const env = context?.env
    const bucket = (env as { CHIBASKO_ASSETS?: AssetsBucket } | undefined)?.CHIBASKO_ASSETS
    if (bucket && typeof bucket.put === 'function' && typeof bucket.head === 'function'
      && typeof bucket.delete === 'function') return bucket
  } catch {
    // A runtime without a usable binding receives the same public error below.
  }
  throw new Error('Stockage R2 indisponible : binding CHIBASKO_ASSETS requis sur Cloudflare.')
}

export async function putPublicImage(
  prefix: string,
  image: { buffer: Uint8Array; extension: string; contentType: string },
  ownerId?: string,
) {
  const avatar = prefix === 'avatars' && ownerId !== undefined
  if (!/^[a-z][a-z-]*$/.test(prefix)
    || (ownerId !== undefined && (!avatar || !ownerIdPattern.test(ownerId)))
    || !(avatar ? /^(jpg|png|webp|gif|ico)$/ : /^(jpg|png|webp|gif|avif|svg)$/).test(image.extension)) {
    throw new Error('Cle image R2 invalide.')
  }
  const key = `${prefix}/${ownerId ? `${ownerId}/` : ''}${crypto.randomUUID()}.${image.extension}`
  const object = await getR2AssetsBucket().put(key, image.buffer, {
    onlyIf: new Headers({ 'If-None-Match': '*' }),
    httpMetadata: { contentType: image.contentType, cacheControl },
    customMetadata: { application: 'chibasko-games', kind: prefix, ...(ownerId ? { userId: ownerId } : {}) },
  })
  if (!object) throw new Error(avatar ? 'Impossible de creer l avatar R2.' : 'Impossible de creer la miniature R2.')
  return `${PUBLIC_ASSET_ORIGIN}/${key}`
}

export function managedImageKey(value: unknown, prefix: string, ownerId?: string): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.origin !== PUBLIC_ASSET_ORIGIN || url.username || url.password
      || url.search || url.hash || url.href !== value) return null
    const key = url.pathname.slice(1)
    const parts = key.split('/')
    if (ownerId !== undefined) {
      if (prefix !== 'avatars' || !ownerIdPattern.test(ownerId)
        || parts.length !== 3 || parts[0] !== prefix || parts[1] !== ownerId
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif|ico)$/.test(parts[2])) return null
      return key
    }
    if (parts.length !== 2 || parts[0] !== prefix
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp|gif|avif|svg)$/.test(parts[1])) return null
    return key
  } catch {
    return null
  }
}

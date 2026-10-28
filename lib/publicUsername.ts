export const PUBLIC_USERNAME_MAX_LENGTH = 32
export const RESERVED_USERNAMES = ['admin', 'administrator', 'administrateur', 'moderator', 'moderateur', 'support', 'system', 'api', 'login', 'register', 'deleted', 'chibasko', 'chibaskogames', 'chibasko-games'] as const
const format = /^[a-z0-9][a-z0-9_-]{1,30}[a-z0-9]$/

export function normalizePublicUsername(value: string) { return value.trim().toLowerCase() }
export function isPublicUsername(value: string) {
  return format.test(value) && !(RESERVED_USERNAMES as readonly string[]).includes(value)
}
export function publicProfilePath(username: string) {
  const handle = normalizePublicUsername(username)
  return '/players/@' + encodeURIComponent(handle)
}
export function publicProfileIdentifier(segment: string) {
  if (segment.length > 128) return null
  try {
    const value = decodeURIComponent(segment)
    const handle = value.startsWith('@') ? value.slice(1) : value
    return /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) || isPublicUsername(handle.toLowerCase()) ? value : null
  } catch { return null }
}
export function generatedUsername(value: string) {
  let username = value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 32).replace(/[-_]+$/g, '')
  if (username.length < 3) username = 'joueur' + (username ? '-' + username : '')
  return isPublicUsername(username) ? username : 'joueur-' + username.slice(0, 25)
}

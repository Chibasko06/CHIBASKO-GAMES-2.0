import { isIP } from 'node:net'
import { createSupabaseAuthenticator } from '../auth/supabaseAuth.js'
import { gameRegistry } from '../games/registry.js'

export type RuntimePolicy = {
  production: boolean; host: string; port: number; origins: readonly string[]
  enabledGames: readonly string[]; shutdownMs: number
}
export function readPolicy(env: NodeJS.ProcessEnv = process.env): RuntimePolicy {
  const mode = env.NODE_ENV ?? 'development'
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV')
  const production = mode === 'production'
  const host = env.HOST ?? '127.0.0.1'
  if (!host.trim() || !isIP(host)) throw new Error('Invalid HOST (IP required)')
  const portText = env.PORT ?? '2567'
  if (!/^\d+$/.test(portText) || +portText < 1 || +portText > 65535) throw new Error('Invalid PORT')
  const origins = (env.ALLOWED_ORIGINS ?? (production ? '' : 'http://localhost:3000,http://127.0.0.1:3000')).split(',').map(s => s.trim()).filter(Boolean)
  if (!origins.length) throw new Error('ALLOWED_ORIGINS required')
  for (const origin of origins) {
    let url: URL
    try { url = new URL(origin) } catch { throw new Error('Invalid ALLOWED_ORIGINS') }
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || origin.includes('*') || (production && url.protocol !== 'https:')) throw new Error('Invalid ALLOWED_ORIGINS')
  }
  const enabledGames = env.ENABLED_GAME_IDS === undefined && !production ? [...gameRegistry.keys()]
    : (env.ENABLED_GAME_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (enabledGames.some(id => !gameRegistry.has(id))) throw new Error('Invalid ENABLED_GAME_IDS')
  if (production && env.DEBUG) throw new Error('DEBUG forbidden in production')
  return { production, host, port: +portText, origins, enabledGames, shutdownMs: 20000 }
}
export function readRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const policy = readPolicy(env)
  let url: URL
  try { url = new URL(env.SUPABASE_URL ?? '') } catch { throw new Error('Invalid SUPABASE_URL') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || url.pathname !== '/' || (policy.production && url.protocol !== 'https:')) throw new Error('Invalid SUPABASE_URL')
  const authenticate = createSupabaseAuthenticator(url.origin, env.SUPABASE_PUBLISHABLE_KEY ?? '')
  return { policy, authenticate }
}

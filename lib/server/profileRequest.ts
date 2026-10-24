import 'server-only'
import {getSupabaseAdminClient} from '@/lib/supabaseAdmin'
import {adminOriginAllowed} from './adminRequest'
import {adminJson} from './adminResponses'
import {InputError} from './inputValidation'
import {logDataFailure} from '@/lib/dataAccess'

export const PROFILE_USERNAME_MAX_LENGTH = 32
// Profile writes use the same 16 KiB JSON budget as other account mutations.
export const PROFILE_BIO_MAX_LENGTH = 16_384

export function profileFields(body: Record<string, unknown>) {
  if (Object.keys(body).some(key => !['username', 'bio'].includes(key))) throw new InputError('Champ non autorisé.')
  if (typeof body.username !== 'string' || !body.username.trim() || body.username.trim().length > PROFILE_USERNAME_MAX_LENGTH) {
    throw new InputError('Le pseudo doit contenir entre 1 et 32 caractères.')
  }
  if (body.bio !== undefined && body.bio !== null && typeof body.bio !== 'string') throw new InputError('Bio invalide.')
  const bio = typeof body.bio === 'string' ? body.bio.trim() : ''
  if (body.username.includes('\0') || bio.includes('\0')) throw new InputError('Caractère non autorisé dans le profil.')
  if (bio.length > PROFILE_BIO_MAX_LENGTH) throw new InputError('Bio trop longue.')
  return {username: body.username.trim(), display_name: body.username.trim(), bio: bio || null}
}

export async function profileIdentity(request: Request) {
  const header = request.headers.get('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw new InputError('Connexion requise.', 401)
  if (!adminOriginAllowed(request)) throw new InputError('Origine refusée.', 403)
  const db = getSupabaseAdminClient()
  const {data, error} = await db.auth.getUser(token)
  if (error) {
    const status = typeof error.status === 'number' ? error.status : 0
    if ([400, 401, 403].includes(status)) throw new InputError('Session expirée. Reconnecte-toi.', 401)
    throw error
  }
  if (!data.user) throw new InputError('Connexion requise.', 401)
  return {db, user: data.user}
}

export function profileFailure(operation: string, error: unknown) {
  if (error instanceof InputError) return adminJson({error: error.message}, {status: error.status})
  logDataFailure(operation, error, 'database_error')
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  if (code === '23505') return adminJson({error: 'Ce pseudo est déjà utilisé.'}, {status: 409})
  return adminJson({error: 'Le profil est temporairement indisponible. Réessaie dans un instant.'}, {status: 503})
}

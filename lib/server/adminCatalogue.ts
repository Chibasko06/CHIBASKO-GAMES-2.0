import 'server-only'
import type {Tables} from '@/types/database'
import {adminJson} from './adminResponses'
import {logDataFailure} from '@/lib/dataAccess'

export function catalogueFailure(operation: string, error: unknown) {
  logDataFailure(operation, error, 'database_error')
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
  const [status, message] = code === 'P0002' ? [404, 'Jeu introuvable.']
    : code === '40001' || code === 'PGRST116' ? [409, 'Ce jeu a changé. Recharge la page puis réessaie.']
    : code === '23505' ? [409, 'Ce slug ou cet identifiant est déjà utilisé.']
    : code === '22023' || code === '22P02' || code === '23503' ? [400, 'Jeu ou catégories invalides.']
    : code === '42501' ? [403, 'Autorisation refusée.']
    : [503, 'Le catalogue est temporairement indisponible. Réessaie dans un instant.']
  return adminJson({error: message}, {status: status as number})
}

export type SavedCatalogueGame = {game: Tables<'games'>; previousThumbnail: string | null}

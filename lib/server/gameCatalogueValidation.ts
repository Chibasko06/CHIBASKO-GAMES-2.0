import type { TablesInsert } from '@/types/database'
import { getMultiplayerDefinition } from '@/lib/multiplayer/catalogue'

export class CatalogueValidationError extends Error {}
const allowed = new Set(['title', 'slug', 'game_url', 'multiplayer_game_id', 'game_type', 'is_beta',
  'thumbnail_url', 'description', 'developer_name', 'release_date_text', 'mobile_compatible',
  'technology', 'provider_name', 'source_page_url', 'is_published', 'category_ids'])
function fail(message: string): never { throw new CatalogueValidationError(message) }
function optionalText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') fail('Champ texte invalide.')
  return value.trim() || null
}
export function validateGameCatalogue(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Formulaire invalide.')
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(key => !allowed.has(key))) fail('Champ non autorisé.')
  const title = optionalText(body.title)
  const slug = optionalText(body.slug)
  if (!title || !slug) fail('Titre et slug obligatoires.')
  const gameType = body.game_type ?? 'classic'
  if (gameType !== 'classic' && gameType !== 'multiplayer_chibasko') fail('Type de jeu invalide.')
  const gameUrl = optionalText(body.game_url)
  const multiplayerId = optionalText(body.multiplayer_game_id)
  if (gameType === 'classic') {
    if (!gameUrl || multiplayerId !== null) fail('URL classique obligatoire ; identifiant multijoueur interdit.')
    try {
      const url = new URL(gameUrl)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('URL du jeu invalide.')
    } catch { fail('URL du jeu invalide.') }
  } else {
    if (gameUrl !== null || !multiplayerId || !getMultiplayerDefinition(multiplayerId)) fail('Jeu Chibasko inconnu ou URL classique interdite.')
  }
  if (body.is_published !== undefined && typeof body.is_published !== 'boolean') fail('Publication invalide.')
  if (body.is_beta !== undefined && typeof body.is_beta !== 'boolean') fail('Bêta invalide.')
  const categories = body.category_ids ?? []
  if (!Array.isArray(categories) || categories.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) fail('Catégories invalides.')
  const payload = {
    title, slug, game_type: gameType, game_url: gameUrl, multiplayer_game_id: multiplayerId,
    is_beta: body.is_beta ?? false,
    is_published: body.is_published ?? (gameType === 'classic'),
    thumbnail_url: optionalText(body.thumbnail_url), description: optionalText(body.description),
    developer_name: optionalText(body.developer_name), release_date_text: optionalText(body.release_date_text),
    mobile_compatible: optionalText(body.mobile_compatible), technology: optionalText(body.technology),
    provider_name: optionalText(body.provider_name), source_page_url: optionalText(body.source_page_url),
  } satisfies TablesInsert<'games'>
  return { payload, categoryIds: [...new Set(categories as string[])] }
}

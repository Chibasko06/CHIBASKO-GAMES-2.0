import {catalogueFailure, type SavedCatalogueGame} from '@/lib/server/adminCatalogue'
import { validateGameCatalogue, CatalogueValidationError } from '@/lib/server/gameCatalogueValidation'
import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../../_utils'
import { cleanupReplacedGameThumbnail } from '@/lib/server/gameMediaStorage'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { id } = await params
  const { supabaseAdmin } = adminCheck
  let validated: ReturnType<typeof validateGameCatalogue>
  try {
    validated = validateGameCatalogue(await readAdminJson(request))
  } catch (error) {
    return adminJson({ error: error instanceof CatalogueValidationError ? error.message : 'Formulaire invalide.' }, { status: 400 })
  }
  const { payload, categoryIds } = validated

  try {
    const {data: previousGame, error: previousError} = await supabaseAdmin
      .from('games').select('thumbnail_url').eq('id', id).maybeSingle()
    if (previousError) throw previousError
    if (!previousGame) return adminJson({error: 'Jeu introuvable.'}, {status: 404})
    const {data, error} = await supabaseAdmin.rpc('admin_save_game' as never, {
      p_actor: adminCheck.user.id, p_id: id, p_game: payload, p_categories: categoryIds,
      p_expected_thumbnail: previousGame.thumbnail_url,
    } as never)
    if (error) throw error
    const saved = data as unknown as SavedCatalogueGame
    await cleanupReplacedGameThumbnail(saved.previousThumbnail, saved.game.thumbnail_url, supabaseAdmin)
    return adminJson({game: saved.game})
  } catch (error) { return catalogueFailure('admin_game_update', error) }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { id } = await params
  const { supabaseAdmin } = adminCheck

  const { error } = await supabaseAdmin
    .from('games')
    .delete()
    .eq('id', id)

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ success: true })
}

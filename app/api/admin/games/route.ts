import {pageNumber} from '@/lib/pagination'
import {catalogueFailure, type SavedCatalogueGame} from '@/lib/server/adminCatalogue'
import { validateGameCatalogue, CatalogueValidationError } from '@/lib/server/gameCatalogueValidation'
import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck

  const page=pageNumber(new URL(request.url).searchParams.get('page'))
  const {data,error,count}=await supabaseAdmin.from('games').select('*, game_categories(category_id)',{count:'exact'}).order('created_at',{ascending:false}).order('id').range((page-1)*50,page*50-1)

  if (error||count===null) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ games: data,total:count,page,pageSize:50 })
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  let validated: ReturnType<typeof validateGameCatalogue>
  try {
    validated = validateGameCatalogue(await readAdminJson(request))
  } catch (error) {
    return adminJson({ error: error instanceof CatalogueValidationError ? error.message : 'Formulaire invalide.' }, { status: 400 })
  }
  const { payload, categoryIds } = validated

  try {
    const {data, error} = await supabaseAdmin.rpc('admin_save_game' as never, {
      p_actor: adminCheck.user.id, p_game: payload, p_categories: categoryIds, p_id: null,
      p_expected_thumbnail: null,
    } as never)
    if (error) throw error
    return adminJson({game: (data as unknown as SavedCatalogueGame).game})
  } catch (error) { return catalogueFailure('admin_game_create', error) }
}

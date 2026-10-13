import { validateGameCatalogue, CatalogueValidationError } from '@/lib/server/gameCatalogueValidation'
import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck

  const { data, error } = await supabaseAdmin
    .from('games')
    .select('*, game_categories(category_id)')
    .order('created_at', { ascending: false })

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ games: data })
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

  const { data, error } = await supabaseAdmin
    .from('games')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  if (categoryIds.length > 0) {
    const { error: categoriesError } = await supabaseAdmin
      .from('game_categories')
      .insert(categoryIds.map((categoryId: string) => ({ game_id: data.id, category_id: categoryId })))

    if (categoriesError) {
      await supabaseAdmin.from('games').delete().eq('id', data.id)
      return adminJson({ error: adminErrorMessage(categoriesError) }, { status: 500 })
    }
  }

  return adminJson({ game: data })
}

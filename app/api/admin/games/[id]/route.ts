import { validateGameCatalogue, CatalogueValidationError } from '@/lib/server/gameCatalogueValidation'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'
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
    validated = validateGameCatalogue(await request.json())
  } catch (error) {
    return NextResponse.json({ error: error instanceof CatalogueValidationError ? error.message : 'Formulaire invalide.' }, { status: 400 })
  }
  const { payload, categoryIds } = validated

  const { data: previousGame, error: previousError } = await supabaseAdmin
    .from('games').select('thumbnail_url').eq('id', id).single()
  if (previousError) {
    return NextResponse.json({ error: previousError.message }, { status: 500 })
  }

  let update = supabaseAdmin
    .from('games')
    .update(payload)
    .eq('id', id)
  // A concurrent thumbnail change must not be overwritten by this request.
  update = previousGame.thumbnail_url === null
    ? update.is('thumbnail_url', null)
    : update.eq('thumbnail_url', previousGame.thumbnail_url)
  const { data, error } = await update
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 409 : 500 })
  }

  const { error: deleteRelationsError } = await supabaseAdmin
    .from('game_categories')
    .delete()
    .eq('game_id', id)

  if (deleteRelationsError) {
    return NextResponse.json({ error: deleteRelationsError.message }, { status: 500 })
  }

  if (categoryIds.length > 0) {
    const { error: categoriesError } = await supabaseAdmin
      .from('game_categories')
      .insert(categoryIds.map((categoryId: string) => ({ game_id: id, category_id: categoryId })))

    if (categoriesError) {
      return NextResponse.json({ error: categoriesError.message }, { status: 500 })
    }
  }

  await cleanupReplacedGameThumbnail(previousGame.thumbnail_url, data.thumbnail_url, supabaseAdmin)
  return NextResponse.json({ game: data })
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

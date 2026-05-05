import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'

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
  const body = await request.json()
  const categoryIds = Array.isArray(body.category_ids)
    ? body.category_ids.filter((value: unknown): value is string => typeof value === 'string')
    : []

  const payload = {
    title: body.title,
    slug: body.slug,
    game_url: body.game_url,
    thumbnail_url: body.thumbnail_url || null,
    description: body.description || null,
    developer_name: body.developer_name || null,
    release_date_text: body.release_date_text || null,
    mobile_compatible: body.mobile_compatible || null,
    technology: body.technology || null,
    provider_name: body.provider_name || null,
    source_page_url: body.source_page_url || null,
    is_published: Boolean(body.is_published),
  }

  const { data, error } = await supabaseAdmin
    .from('games')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../_utils'

function slugifyCategory(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck

  const { data, error } = await supabaseAdmin
    .from('categories')
    .select('*, game_categories(game_id)')
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const categories = (data ?? []).map((category) => ({
    ...category,
    games_count: Array.isArray(category.game_categories) ? category.game_categories.length : 0,
  }))

  return NextResponse.json({ categories })
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const body = await request.json()

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const slugSource = typeof body.slug === 'string' ? body.slug.trim() : ''
  const slug = slugifyCategory(slugSource || name)

  if (!name || !slug) {
    return NextResponse.json({ error: 'Nom de categorie invalide.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({ name, slug })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ category: data })
}

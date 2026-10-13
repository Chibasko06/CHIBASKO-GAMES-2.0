import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../../_utils'

function slugifyCategory(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

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
  let body: Record<string, unknown>
  try { body = await readAdminJson(request) }
  catch { return adminJson({ error: 'Formulaire invalide.' }, { status: 400 }) }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const slugSource = typeof body.slug === 'string' ? body.slug.trim() : ''
  const slug = slugifyCategory(slugSource || name)

  if (!name || !slug) {
    return adminJson({ error: 'Nom de categorie invalide.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('categories')
    .update({ name, slug })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ category: data })
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
    .from('categories')
    .delete()
    .eq('id', id)

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ success: true })
}

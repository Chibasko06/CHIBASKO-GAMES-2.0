import { NextRequest } from 'next/server'
import {readAllRows} from '@/lib/pagination'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../_utils'

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

  const {data,error}=await readAllRows('admin_categories',(from,to)=>supabaseAdmin.from('categories').select('*, game_categories(count)',{count:'exact'}).order('name').order('id').range(from,to)).then(data=>({data,error:null}),error=>({data:[],error}))

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  const categories = (data ?? []).map((category) => ({
    ...category,
    games_count: category.game_categories?.[0]?.count??0,
  }))

  return adminJson({ categories })
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

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
    .insert({ name, slug })
    .select('*')
    .single()

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ category: data })
}

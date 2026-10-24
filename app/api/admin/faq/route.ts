import { NextRequest } from 'next/server'
import {readAllRows} from '@/lib/pagination'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const {data,error}=await readAllRows('admin_faq',(from,to)=>supabaseAdmin.from('faq_entries').select('*',{count:'exact'}).order('sort_order').order('created_at').order('id').range(from,to)).then(data=>({data,error:null}),error=>({data:[],error}))

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ faqEntries: data ?? [] })
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

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : Number(body.sort_order) || 0
  const isPublished = Boolean(body.is_published)

  if (!question || !answer) {
    return adminJson({ error: 'Question et reponse obligatoires.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('faq_entries')
    .insert({
      question,
      answer,
      sort_order: sortOrder,
      is_published: isPublished,
    })
    .select('*')
    .single()

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ faqEntry: data })
}

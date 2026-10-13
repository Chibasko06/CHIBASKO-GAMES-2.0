import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../../_utils'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  let body: Record<string, unknown>
  try { body = await readAdminJson(request) }
  catch { return adminJson({ error: 'Formulaire invalide.' }, { status: 400 }) }
  const { id } = await params

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : Number(body.sort_order) || 0
  const isPublished = Boolean(body.is_published)

  if (!question || !answer) {
    return adminJson({ error: 'Question et reponse obligatoires.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('faq_entries')
    .update({
      question,
      answer,
      sort_order: sortOrder,
      is_published: isPublished,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ faqEntry: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const { id } = await params

  const { error } = await supabaseAdmin
    .from('faq_entries')
    .delete()
    .eq('id', id)

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ success: true })
}

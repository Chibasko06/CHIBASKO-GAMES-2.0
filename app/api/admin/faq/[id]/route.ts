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

  const { supabaseAdmin } = adminCheck
  const body = await request.json()
  const { id } = await params

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : Number(body.sort_order) || 0
  const isPublished = Boolean(body.is_published)

  if (!question || !answer) {
    return NextResponse.json({ error: 'Question et reponse obligatoires.' }, { status: 400 })
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ faqEntry: data })
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

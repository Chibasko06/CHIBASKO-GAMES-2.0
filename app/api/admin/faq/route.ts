import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../_utils'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const { data, error } = await supabaseAdmin
    .from('faq_entries')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ faqEntries: data ?? [] })
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const body = await request.json()

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  const answer = typeof body.answer === 'string' ? body.answer.trim() : ''
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : Number(body.sort_order) || 0
  const isPublished = Boolean(body.is_published)

  if (!question || !answer) {
    return NextResponse.json({ error: 'Question et reponse obligatoires.' }, { status: 400 })
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ faqEntry: data })
}

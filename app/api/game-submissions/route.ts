import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

function normalizeCategories(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 8)
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const payload = {
    name_or_studio: typeof body.name_or_studio === 'string' ? body.name_or_studio.trim() : '',
    email: typeof body.email === 'string' ? body.email.trim() : '',
    game_title: typeof body.game_title === 'string' ? body.game_title.trim() : '',
    demo_url: typeof body.demo_url === 'string' ? body.demo_url.trim() : '',
    game_type: typeof body.game_type === 'string' ? body.game_type.trim() : '',
    category_names: normalizeCategories(body.category_names),
    description: typeof body.description === 'string' ? body.description.trim() : '',
    has_ads:
      typeof body.has_ads === 'boolean'
        ? body.has_ads
        : body.has_ads === 'yes'
          ? true
          : body.has_ads === 'no'
            ? false
            : null,
    published_elsewhere:
      typeof body.published_elsewhere === 'string' ? body.published_elsewhere.trim() : '',
    expectations: typeof body.expectations === 'string' ? body.expectations.trim() : '',
    message: typeof body.message === 'string' ? body.message.trim() : '',
  }

  if (!payload.name_or_studio || !payload.email || !payload.game_title || !payload.demo_url || !payload.game_type || !payload.description) {
    return NextResponse.json({ error: 'Merci de remplir tous les champs obligatoires.' }, { status: 400 })
  }

  if (!isValidHttpUrl(payload.demo_url)) {
    return NextResponse.json({ error: 'Le lien de demo doit etre une URL valide.' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdminClient()
  const { error } = await supabaseAdmin.from('game_submissions').insert({
    name_or_studio: payload.name_or_studio,
    email: payload.email,
    game_title: payload.game_title,
    demo_url: payload.demo_url,
    game_type: payload.game_type,
    category_names: payload.category_names,
    description: payload.description,
    has_ads: payload.has_ads,
    published_elsewhere: payload.published_elsewhere || null,
    expectations: payload.expectations || null,
    message: payload.message || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

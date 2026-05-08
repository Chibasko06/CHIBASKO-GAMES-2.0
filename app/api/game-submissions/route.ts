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
    return url.protocol === 'https:'
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
    developer_website: typeof body.developer_website === 'string' ? body.developer_website.trim() : '',
    game_type: typeof body.game_type === 'string' ? body.game_type.trim() : '',
    category_names: normalizeCategories(body.category_names),
    short_description: typeof body.short_description === 'string' ? body.short_description.trim() : '',
    long_description: typeof body.long_description === 'string' ? body.long_description.trim() : '',
    mobile_compatibility: typeof body.mobile_compatibility === 'string' ? body.mobile_compatibility.trim() : '',
    sensitive_content: typeof body.sensitive_content === 'string' ? body.sensitive_content.trim() : '',
    ownership_confirmed: Boolean(body.ownership_confirmed),
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

  if (
    !payload.name_or_studio ||
    !payload.email ||
    !payload.game_title ||
    !payload.demo_url ||
    !payload.game_type ||
    !payload.short_description ||
    !payload.long_description ||
    !payload.mobile_compatibility ||
    !payload.sensitive_content
  ) {
    return NextResponse.json({ error: 'Merci de remplir tous les champs obligatoires.' }, { status: 400 })
  }

  if (!isValidHttpUrl(payload.demo_url)) {
    return NextResponse.json({ error: 'Le lien de demo doit commencer par https://.' }, { status: 400 })
  }

  if (payload.developer_website && !isValidHttpUrl(payload.developer_website)) {
    return NextResponse.json({ error: 'Le site ou portfolio doit commencer par https://.' }, { status: 400 })
  }

  if (!payload.ownership_confirmed) {
    return NextResponse.json({ error: 'Tu dois confirmer que tu es proprietaire du jeu ou autorise a le proposer.' }, { status: 400 })
  }

  const supabaseAdmin = getSupabaseAdminClient()
  const { error } = await supabaseAdmin.from('game_submissions').insert({
    name_or_studio: payload.name_or_studio,
    email: payload.email,
    game_title: payload.game_title,
    demo_url: payload.demo_url,
    developer_website: payload.developer_website || null,
    game_type: payload.game_type,
    category_names: payload.category_names,
    description: payload.long_description,
    short_description: payload.short_description,
    long_description: payload.long_description,
    mobile_compatibility: payload.mobile_compatibility,
    sensitive_content: payload.sensitive_content,
    ownership_confirmed: payload.ownership_confirmed,
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

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

function sanitizeUsername(value: string | null | undefined) {
  const normalized = (value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 32)

  return normalized || 'joueur'
}

async function buildUniqueUsername(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  requestedUsername: string | null | undefined,
  userId: string
) {
  const base = sanitizeUsername(requestedUsername)
  const suffix = userId.slice(0, 6).toLowerCase()
  const candidates = [base, `${base}-${suffix}`, `${base}-${Date.now().toString().slice(-4)}`]

  for (const username of candidates) {
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()

    if (!existingProfile || existingProfile.id === userId) {
      return username
    }
  }

  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null

  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdminClient()
  const {
    data: { user },
    error: userError,
  } = await supabaseAdmin.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: userError?.message || 'Unauthorized' }, { status: 401 })
  }

  const metadata = user.user_metadata || {}
  const requestedUsername =
    metadata.user_name ||
    metadata.username ||
    metadata.preferred_username ||
    metadata.nickname ||
    metadata.full_name ||
    metadata.name ||
    metadata.global_name ||
    (typeof user.email === 'string' ? user.email.split('@')[0] : null)
  const requestedBio =
    typeof metadata.bio === 'string'
      ? metadata.bio.trim()
      : typeof metadata.onboarding_bio === 'string'
        ? metadata.onboarding_bio.trim()
        : ''

  const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (profileLookupError) {
    return NextResponse.json({ error: profileLookupError.message }, { status: 500 })
  }

  if (existingProfile) {
    const patch: {
      display_name?: string
      username?: string
      bio?: string | null
    } = {}

    if (!existingProfile.display_name) {
      patch.display_name = existingProfile.username || sanitizeUsername(requestedUsername)
    }

    if (!existingProfile.username?.trim()) {
      patch.username = await buildUniqueUsername(supabaseAdmin, requestedUsername, user.id)
    }

    if (!existingProfile.bio?.trim() && requestedBio) {
      patch.bio = requestedBio
    }

    if (Object.keys(patch).length > 0) {
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(patch)
        .eq('id', user.id)
        .select('*')
        .single()

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ profile: updatedProfile, created: false, repaired: true })
    }

    return NextResponse.json({ profile: existingProfile, created: false, repaired: false })
  }

  const username = await buildUniqueUsername(supabaseAdmin, requestedUsername, user.id)

  const { data: createdProfile, error: insertError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: user.id,
      username,
      display_name: username,
      avatar_url: null,
      bio: requestedBio || null,
      xp_points: 0,
      last_xp_tick_at: new Date().toISOString(),
    })
    .select('*')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ profile: createdProfile, created: true, repaired: false })
}

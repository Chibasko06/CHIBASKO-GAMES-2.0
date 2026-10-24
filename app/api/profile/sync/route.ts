import { NextRequest } from 'next/server'
import {adminJson} from '@/lib/server/adminResponses'
import {profileIdentity, profileFailure, PROFILE_BIO_MAX_LENGTH} from '@/lib/server/profileRequest'
import {InputError, readJsonObject} from '@/lib/server/inputValidation'
import {readData} from '@/lib/dataAccess'
import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

function sanitizeUsername(value: string | null | undefined) {
  const normalized = (typeof value === 'string' ? value : '')
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
  const candidates = [base, `${base.slice(0, 25)}-${suffix}`, `${base.slice(0, 27)}-${Date.now().toString().slice(-4)}`]

  for (const username of candidates) {
    const { data: existingProfile } = await readData('profile_username_lookup', supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle())

    if (!existingProfile || existingProfile.id === userId) {
      return username
    }
  }

  return `${base.slice(0, 25)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function POST(request: NextRequest) {
  try {
    const {db: supabaseAdmin, user} = await profileIdentity(request)
    if (request.body) {
      const body = await readJsonObject(request)
      if (Object.keys(body).length) throw new InputError('Aucun champ attendu.')
    }
    const metadata = user.user_metadata || {}
    const requestedUsername = [metadata.user_name, metadata.username, metadata.preferred_username,
      metadata.nickname, metadata.full_name, metadata.name, metadata.global_name, user.email?.split('@')[0]]
      .find(value => typeof value === 'string' && value.trim())
    const requestedBio =
      typeof metadata.bio === 'string'
        ? metadata.bio.trim()
        : typeof metadata.onboarding_bio === 'string'
          ? metadata.onboarding_bio.trim()
          : ''

    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, created_at')
      .eq('id', user.id)
      .maybeSingle()

    if (profileLookupError) {
      throw profileLookupError
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
        if (requestedBio.length > PROFILE_BIO_MAX_LENGTH || requestedBio.includes('\0')) throw new InputError('Bio invalide ou trop longue.')
        patch.bio = requestedBio
      }

      if (Object.keys(patch).length > 0) {
        const { data: updatedProfile, error: updateError } = await supabaseAdmin
          .from('profiles')
          .update(patch)
          .eq('id', user.id)
          .select('id, username, display_name, avatar_url, bio, created_at')
          .single()

        if (updateError) {
          throw updateError
        }

        return adminJson({ profile: updatedProfile, created: false, repaired: true })
      }

      return adminJson({ profile: existingProfile, created: false, repaired: false })
    }

    if (requestedBio.length > PROFILE_BIO_MAX_LENGTH || requestedBio.includes('\0')) throw new InputError('Bio invalide ou trop longue.')
    const username = await buildUniqueUsername(supabaseAdmin, requestedUsername, user.id)

    const { data: createdProfile, error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: user.id,
        username,
        display_name: username,
        avatar_url: null,
        bio: requestedBio || null,
      })
      .select('id, username, display_name, avatar_url, bio, created_at')
      .single()

    if (insertError) {
      throw insertError
    }

    return adminJson({ profile: createdProfile, created: true, repaired: false })
  } catch (error) { return profileFailure('profile_sync', error) }
}

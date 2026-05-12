import { getSupabaseAdminClient } from '@/lib/supabaseAdmin'

export function sanitizeProfileHandle(value: string | null | undefined) {
  const normalized = (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)

  return normalized || 'joueur'
}

export function normalizePublicHandle(value: string | null | undefined) {
  return sanitizeProfileHandle((value || '').replace(/^@+/, ''))
}

export async function buildUniqueProfileHandle(
  supabaseAdmin: ReturnType<typeof getSupabaseAdminClient>,
  requestedValue: string | null | undefined,
  userId: string
) {
  const base = sanitizeProfileHandle(requestedValue)
  const suffix = userId.slice(0, 6).toLowerCase()
  const candidates = [base, `${base}-${suffix}`, `${base}-${Date.now().toString().slice(-4)}`]

  for (const handle of candidates) {
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('public_handle', handle)
      .maybeSingle()

    if (!existingProfile || existingProfile.id === userId) {
      return handle
    }
  }

  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}

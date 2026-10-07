import { InputError, isEmail } from './inputValidation'

function text(body: Record<string, unknown>, key: string, max: number, required = false) {
  const raw = body[key]
  if (raw !== undefined && typeof raw !== 'string') throw new InputError(`Champ invalide : ${key}.`)
  const value = typeof raw === 'string' ? raw.trim() : ''
  if ((required && !value) || value.length > max) throw new InputError(`Champ invalide : ${key}.`)
  return value
}

function httpsUrl(value: string) {
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
    return url.toString()
  } catch {
    throw new InputError('Les liens doivent etre des URLs HTTPS sans identifiants.')
  }
}

export function validateGameSubmission(body: Record<string, unknown>) {
  const email = text(body, 'email', 254, true).toLowerCase()
  if (!isEmail(email)) throw new InputError('Adresse email invalide.')
  if (body.ownership_confirmed !== true) throw new InputError('Confirmation de propriete obligatoire.')
  const mobile = text(body, 'mobile_compatibility', 32, true)
  const sensitive = text(body, 'sensitive_content', 32, true)
  if (!['mobile-compatible', 'pc-only', 'partial'].includes(mobile)
      || !['none', 'violence-light', 'violence-strong', 'adult-themes', 'mixed-sensitive'].includes(sensitive)) {
    throw new InputError('Option de compatibilite ou de contenu invalide.')
  }
  const rawCategories = body.category_names ?? []
  if (!Array.isArray(rawCategories) || rawCategories.length > 8
      || rawCategories.some((value) => typeof value !== 'string' || !value.trim() || value.length > 100)) {
    throw new InputError('Categories invalides (8 maximum).')
  }
  const rawAds = body.has_ads
  if (rawAds !== undefined && rawAds !== null && typeof rawAds !== 'boolean'
      && !['yes', 'no', 'unknown'].includes(String(rawAds))) {
    throw new InputError('Option publicitaire invalide.')
  }
  const description = text(body, 'long_description', 10_000, true)
  // Explicit allowlist: no public field is spread into the database insert.
  return {
    name_or_studio: text(body, 'name_or_studio', 120, true),
    email,
    game_title: text(body, 'game_title', 160, true),
    demo_url: httpsUrl(text(body, 'demo_url', 2048, true))!,
    developer_website: httpsUrl(text(body, 'developer_website', 2048)),
    game_type: text(body, 'game_type', 100, true),
    category_names: [...new Set((rawCategories as string[]).map((value) => value.trim()))],
    short_description: text(body, 'short_description', 300, true),
    long_description: description,
    description,
    mobile_compatibility: mobile,
    sensitive_content: sensitive,
    ownership_confirmed: true,
    has_ads: typeof rawAds === 'boolean' ? rawAds : rawAds === 'yes' ? true : rawAds === 'no' ? false : null,
    published_elsewhere: text(body, 'published_elsewhere', 2000) || null,
    expectations: text(body, 'expectations', 2000) || null,
    message: text(body, 'message', 4000) || null,
    status: 'pending',
    admin_notes: null,
  }
}

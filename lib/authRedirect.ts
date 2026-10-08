import { siteConfig } from '@/lib/seo'

export function safeAuthNext(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/'
  try {
    const url = new URL(value, 'https://internal.invalid')
    if (url.origin !== 'https://internal.invalid' || url.hash) return '/'
    for (const key of url.searchParams.keys()) if (/token|authorization|reservation|session|code/i.test(key)) return '/'
    // Encoded slashes/backslashes must never turn a destination into an external URL.
    if (/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|20)/i.test(url.pathname)) return '/'
    return url.pathname + url.search
  } catch { return '/' }
}

export function getSiteOrigin() {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }

  return siteConfig.url
}

export function getOAuthRedirectUrl(nextPath = '/') {
  const next = safeAuthNext(nextPath)
  const redirectUrl = new URL('/auth/callback', getSiteOrigin())
  redirectUrl.searchParams.set('next', next)
  return redirectUrl.toString()
}

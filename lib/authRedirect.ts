import { siteConfig } from '@/lib/seo'

export function getSiteOrigin() {
  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }

  return siteConfig.url
}

export function getOAuthRedirectUrl(nextPath = '/') {
  const next = nextPath.startsWith('/') ? nextPath : '/'
  const redirectUrl = new URL('/auth/callback', getSiteOrigin())
  redirectUrl.searchParams.set('next', next)
  return redirectUrl.toString()
}

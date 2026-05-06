const defaultSiteUrl = 'https://chibasko-games-2-0-git-main-chibasko06s-projects.vercel.app'

export function getSiteUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (envUrl) {
    return envUrl.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin.replace(/\/+$/, '')
  }

  return defaultSiteUrl
}

export function getResetPasswordRedirectUrl() {
  return `${getSiteUrl()}/reset-password`
}

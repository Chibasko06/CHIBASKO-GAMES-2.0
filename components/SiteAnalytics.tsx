'use client'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useLayoutEffect } from 'react'
import { analyticsId as id, privateLobbyPath, protectLobbyNavigation } from '@/lib/multiplayer/analyticsPrivacy'

export { privateLobbyPath } from '@/lib/multiplayer/analyticsPrivacy'
export function suppressLobbyAnalytics() {
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = true
}
export default function SiteAnalytics() {
  const pathname = usePathname()
  const privatePage = privateLobbyPath(pathname)
  useLayoutEffect(() => protectLobbyNavigation(window), [])
  useLayoutEffect(() => {
    (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = privatePage
  }, [privatePage, pathname])
  if (privatePage) return null
  return <>
    <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
    <Script id="google-analytics" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      function safeAnalyticsUrl(value) {
        try { var u = new URL(value); u.search = ''; u.hash = ''; u.pathname = u.pathname.replace(/(\\/games\\/[^/]+\\/lobby\\/)[^/]+/, '$1private'); return u.href; } catch { return ''; }
      }
      gtag('js', new Date());
      gtag('config', '${id}', {page_location: safeAnalyticsUrl(location.href), page_referrer: safeAnalyticsUrl(document.referrer)});
    `}</Script>
  </>
}

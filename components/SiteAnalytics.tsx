'use client'
import { usePathname } from 'next/navigation'
import { useLayoutEffect } from 'react'
import { analyticsId as id, privateLobbyPath, protectLobbyNavigation } from '@/lib/multiplayer/analyticsPrivacy'
import {connectAnalyticsConsent} from '@/lib/analyticsConsent'

export { privateLobbyPath } from '@/lib/multiplayer/analyticsPrivacy'
export function suppressLobbyAnalytics() {
  if (typeof window !== 'undefined') (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = true
}
export default function SiteAnalytics() {
  const pathname = usePathname()
  const privatePage = privateLobbyPath(pathname)
  useLayoutEffect(() => protectLobbyNavigation(window), [])
  useLayoutEffect(() => {
    connectAnalyticsConsent(window).setPrivatePage(privatePage)
  }, [privatePage, pathname])
  return null
}

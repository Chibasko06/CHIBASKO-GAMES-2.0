"use client";

import dynamic from 'next/dynamic'

const ScrollToTopButton = dynamic(() => import('@/components/ScrollToTopButton'), { ssr: false })
const XpHeartbeat = dynamic(() => import('@/components/XpHeartbeat'), { ssr: false })

export default function ClientEnhancements() {
  return (
    <>
      <XpHeartbeat />
      <ScrollToTopButton />
    </>
  )
}

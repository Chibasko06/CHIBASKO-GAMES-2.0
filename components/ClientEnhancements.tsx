"use client";

import dynamic from 'next/dynamic'

const ScrollToTopButton = dynamic(() => import('@/components/ScrollToTopButton'), { ssr: false })

export default function ClientEnhancements() {
  return <ScrollToTopButton />
}

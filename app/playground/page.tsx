import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import PlaygroundClient from './PlaygroundClient'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Playground multijoueur local',
  robots: { index: false, follow: false },
}

export default function PlaygroundPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <PlaygroundClient />
}

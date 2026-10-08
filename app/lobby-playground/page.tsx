import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import LobbyPlaygroundClient from './LobbyPlaygroundClient'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Lobby local Chibasko', robots: { index: false, follow: false } }
export default function LobbyPlaygroundPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <LobbyPlaygroundClient />
}

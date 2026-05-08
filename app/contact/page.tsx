import type { Metadata } from 'next'
import ContactPageClient from '@/components/ContactPageClient'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Contacte l equipe Chibasko Games pour une question, un retour, un bug ou une idee de partenariat.',
  path: '/contact',
})

export default function ContactPage() {
  return <ContactPageClient />
}

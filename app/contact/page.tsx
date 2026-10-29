import type { Metadata } from 'next'
import ReportContact from '@/components/ReportContact'
import ContactPageClient from '@/components/ContactPageClient'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Contacte l equipe Chibasko Games pour une question, un retour, un bug ou une idee de partenariat.',
  path: '/contact',
})

export default async function ContactPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams
  if(query.report==='player'||query.report==='game')return <ReportContact kind={query.report} target={typeof query.target==='string'?query.target:''} siteKey={process.env.MODERATION_TURNSTILE_SITE_KEY}/>
  return <ContactPageClient />
}

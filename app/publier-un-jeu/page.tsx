import type { Metadata } from 'next'
import SubmitGamePageClient from '@/components/SubmitGamePageClient'
import { getCategories } from '@/lib/queries/games'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Publier un jeu',
  description:
    'Propose ton jeu navigateur a Chibasko Games et envoie une fiche developpeur complete pour etude manuelle par l equipe.',
  path: '/publier-un-jeu',
})

export default async function PublishGamePage() {
  const categories = await getCategories()

  return <SubmitGamePageClient categories={categories} />
}

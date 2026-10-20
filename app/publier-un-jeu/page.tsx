import type { Metadata } from 'next'
import SubmitGamePageClient from '@/components/SubmitGamePageClient'
import { getCategories } from '@/lib/queries/games'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Publier un jeu navigateur sur Chibasko Games',
  description:
    'Envoyez votre build Web ZIP et suivez sa vérification manuelle par Chibasko Games. Chaque version fait l’objet d’une revue avant publication.',
  path: '/publier-un-jeu',
})

export default async function PublishGamePage() {
  const categories = await getCategories()

  return <SubmitGamePageClient categories={categories} />
}

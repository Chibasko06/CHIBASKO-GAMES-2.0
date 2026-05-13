import type { Metadata } from 'next'
import SubmitGamePageClient from '@/components/SubmitGamePageClient'
import { getCategories } from '@/lib/queries/games'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Publier un jeu navigateur sur Chibasko Games',
  description:
    'Developpeur HTML5, WebGL ou iframe : propose ton jeu navigateur a Chibasko Games pour etude, visibilite et eventuelles collaborations.',
  path: '/publier-un-jeu',
})

export default async function PublishGamePage() {
  const categories = await getCategories()

  return <SubmitGamePageClient categories={categories} />
}

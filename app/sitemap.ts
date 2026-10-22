import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'
import { getGamesCatalog, getCategories } from '@/lib/queries/games'
import {categoryPath} from '@/lib/seoCatalogue'
import { getPublicProfiles } from '@/lib/queries/profiles'

export const dynamic='force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [games, profiles, categories] = await Promise.all([
    getGamesCatalog(),
    getPublicProfiles(),
    getCategories(),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl('/developpeurs'), changeFrequency: 'monthly', priority: 0.7 },
    { url: absoluteUrl('/confidentialite'), changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/cookies'), changeFrequency: 'monthly', priority: 0.3 },
    { url: absoluteUrl('/multiplayer'), changeFrequency: 'weekly', priority: 0.9 },
    {
      url: absoluteUrl('/'),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: absoluteUrl('/games'),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/players'),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: absoluteUrl('/faq'),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: absoluteUrl('/a-propos'),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: absoluteUrl('/contact'),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: absoluteUrl('/publier-un-jeu'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: absoluteUrl('/mentions-legales'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ]

  const publishedGames=games.filter(game=>game.is_published)
  const gameRoutes: MetadataRoute.Sitemap = publishedGames.map((game) => ({
    url: absoluteUrl(`/games/${game.slug}`),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const profileRoutes: MetadataRoute.Sitemap = profiles.map((profile) => ({
    url: absoluteUrl(`/players/${profile.id}`),
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  const categoryRoutes:MetadataRoute.Sitemap=categories
    .filter(category=>publishedGames.some(game=>game.categories.some(entry=>entry.id===category.id)))
    .map(category=>({url:absoluteUrl(categoryPath(category.slug)),changeFrequency:'weekly',priority:0.7}))

  // No editorial update timestamp exists for games; do not fabricate lastModified.
  return [...staticRoutes, ...categoryRoutes, ...gameRoutes, ...profileRoutes]
}

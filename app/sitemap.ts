import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'
import { getGamesCatalog } from '@/lib/queries/games'
import { getPublicProfiles } from '@/lib/queries/profiles'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [games, profiles] = await Promise.all([
    getGamesCatalog(),
    getPublicProfiles(),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
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

  const gameRoutes: MetadataRoute.Sitemap = games.map((game) => ({
    url: absoluteUrl(`/games/${game.slug}`),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const profileRoutes: MetadataRoute.Sitemap = profiles.map((profile) => ({
    url: absoluteUrl(`/players/@${profile.public_handle}`),
    changeFrequency: 'weekly',
    priority: 0.5,
  }))

  return [...staticRoutes, ...gameRoutes, ...profileRoutes]
}

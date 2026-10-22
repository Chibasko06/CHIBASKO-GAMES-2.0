import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Account pages remain crawlable so their explicit noindex can be read.
      disallow: ['/admin', '/api/'],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  }
}

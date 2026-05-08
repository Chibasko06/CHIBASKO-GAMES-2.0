import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/seo'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    description: siteConfig.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#22d3ee',
    lang: 'fr',
    icons: [
      {
        src: '/logo-chibaskogames-rond.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}

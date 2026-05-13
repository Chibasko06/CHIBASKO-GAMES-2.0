import type { Metadata } from 'next'

export const siteConfig = {
  name: 'Chibasko Games',
  shortName: 'Chibasko',
  url: 'https://chibaskogames.fr',
  description:
    'Joue gratuitement a des jeux en ligne sur Chibasko Games : catalogue navigateur, profils joueurs, favoris, avis et futurs projets de creation.',
  logoPath: '/chibaskogames-logo.png',
  ogImage: '/chibaskogames-logo.png',
  faviconPath: '/chibaskogames-logo.png',
  socials: {
    discord: '',
    instagram: '',
    tiktok: '',
    youtube: '',
  },
}

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${siteConfig.url}${normalizedPath}`
}

export function buildPageMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string
  description: string
  path: string
  image?: string
}): Metadata {
  const canonical = absoluteUrl(path)
  const imageUrl = image ? (image.startsWith('http') ? image : absoluteUrl(image)) : absoluteUrl(siteConfig.ogImage)

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: siteConfig.name,
      locale: 'fr_FR',
      type: 'website',
      images: [
        {
          url: imageUrl,
          alt: `${siteConfig.name} logo`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

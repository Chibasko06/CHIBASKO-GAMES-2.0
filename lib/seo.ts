import type { Metadata } from 'next'

export const siteConfig = {
  name: 'Chibasko Games',
  shortName: 'Chibasko',
  url: 'https://chibaskogames.fr',
  description:
    'Chibasko Games est une plateforme de jeux gratuits en ligne avec catalogue, profils joueurs, favoris, commentaires et futurs projets de creation de jeux.',
  ogImage: '/logo-chibaskogames-rond.ico',
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

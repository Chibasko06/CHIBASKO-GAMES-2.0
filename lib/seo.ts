import type { Metadata } from 'next'

export const siteConfig = {
  name: 'Chibasko Games',
  shortName: 'Chibasko Games',
  // Canonicals describe the public site, including when rendered on a preview host.
  url: 'https://chibaskogames.fr',
  description:
    'Découvre les jeux gratuits de Chibasko Games : action, arcade, sport et jeux à partager, directement dans ton navigateur.',
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
  imageAlt,
}: {
  title: string
  description: string
  path: string
  image?: string
  imageAlt?: string
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
          alt: imageAlt || (image ? title : `Logo ${siteConfig.name}`),
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

export const privatePageMetadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: null },
}

// JSON-LD can contain catalogue text; escape HTML delimiters before script output.
export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

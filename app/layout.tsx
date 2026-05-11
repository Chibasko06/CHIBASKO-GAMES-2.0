import './globals.css'
import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/components/AuthProvider'
import { Navbar } from '@/components/Navbar'
import Footer from '@/components/Footer'
import ScrollToTopButton from '@/components/ScrollToTopButton'
import XpHeartbeat from '@/components/XpHeartbeat'
import { siteConfig } from '@/lib/seo'

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  keywords: [
    'jeux gratuits',
    'jeux en ligne',
    'browser games',
    'jeux navigateur',
    'chibasko games',
    'arcade',
    'jeux pc',
    'jeux mobile',
  ],
  alternates: {
    canonical: siteConfig.url,
  },
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    siteName: siteConfig.name,
    locale: 'fr_FR',
    type: 'website',
    images: [
      {
        url: siteConfig.ogImage,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/logo-chibaskogames-rond.ico',
    shortcut: '/logo-chibaskogames-rond.ico',
    apple: '/logo-chibaskogames-rond.ico',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const socialLinks = Object.values(siteConfig.socials).filter(Boolean)
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: siteConfig.name,
        url: siteConfig.url,
        logo: `${siteConfig.url}${siteConfig.ogImage}`,
        sameAs: socialLinks.length ? socialLinks : undefined,
      },
      {
        '@type': 'WebSite',
        name: siteConfig.name,
        url: siteConfig.url,
        inLanguage: 'fr-FR',
        description: siteConfig.description,
      },
    ],
  }

  return (
    <html lang="fr">
      <body className="bg-zinc-950 text-white">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <AuthProvider>
          <XpHeartbeat />
          <Navbar />
          <main className="mx-auto w-full max-w-[2200px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10 2xl:px-12">
            {children}
          </main>
          <ScrollToTopButton />
          <Footer />
        </AuthProvider>
      </body>
    </html>
  )
}

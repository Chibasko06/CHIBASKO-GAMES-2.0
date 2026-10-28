import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import ProfileCard from '@/components/ProfileCard'
import {resolveViewerProfile} from '@/lib/server/publicProfiles'
import {publicProfileIdentifier, publicProfilePath} from '@/lib/publicUsername'
import {cache} from 'react'

const getProfile = cache(resolveViewerProfile)

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const username = publicProfileIdentifier((await params).username)
  const profile = username ? await getProfile(username) : null

  if (!profile) {
    return {
      title: 'Profil introuvable',
      robots: {
        index: false,
        follow: false,
      },
    }
  }

  const description =
    profile.bio ||
    `Consulte le profil public de ${profile.username} sur Chibasko Games.`

  return {
    title: `${profile.username} - Profil joueur`,
    description,
    alternates: {
      canonical: `https://chibaskogames.fr${publicProfilePath(profile.username)}`,
    },
    openGraph: {
      title: `${profile.username} - Profil joueur`,
      description,
      url: `https://chibaskogames.fr${publicProfilePath(profile.username)}`,
      type: 'profile',
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : undefined,
    },
    twitter: {
      card: 'summary',
      title: `${profile.username} - Profil joueur`,
      description,
      images: profile.avatar_url ? [profile.avatar_url] : undefined,
    },
  }
}

export default async function PublicPlayerPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const username = publicProfileIdentifier((await params).username)
  const profile = username ? await getProfile(username) : null

  if (!profile) {
    notFound()
  }

  if (username !== '@' + profile.username) {
    redirect(publicProfilePath(profile.username))
  }


  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/players" className="inline-flex py-2 text-sm text-cyan-300 hover:underline">← Communauté</Link>
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Profil public</p>
      <ProfileCard profile={profile} heading="h1" />
    </div>
  )
}

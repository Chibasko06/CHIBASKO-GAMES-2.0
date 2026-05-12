import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import ProfileCard from '@/components/ProfileCard'
import { normalizePublicHandle } from '@/lib/profileHandle'
import { getPublicProfileByHandle, getPublicProfileSummary } from '@/lib/queries/profiles'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>
}): Promise<Metadata> {
  const { username } = await params
  const profile = await getPublicProfileByHandle(normalizePublicHandle(username))

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
      canonical: `https://chibaskogames.fr/players/@${profile.public_handle}`,
    },
    openGraph: {
      title: `${profile.username} - Profil joueur`,
      description,
      url: `https://chibaskogames.fr/players/@${profile.public_handle}`,
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
  const { username } = await params
  const normalizedHandle = normalizePublicHandle(username)

  if (username !== `@${normalizedHandle}`) {
    redirect(`/players/@${normalizedHandle}`)
  }

  const profile = await getPublicProfileByHandle(normalizedHandle)

  if (!profile) {
    notFound()
  }

  const stats = await getPublicProfileSummary(profile.id)

  return (
    <main className="space-y-8">
      <section className="rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(135deg,rgba(10,15,23,0.98),rgba(10,10,12,0.98))] p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/75">Profil public</p>
        <h1 className="mt-3 text-3xl font-black uppercase text-white md:text-4xl">{profile.username}</h1>
        <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-cyan-300">@{profile.public_handle}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Voici la fiche publique de ce joueur: pseudo, avatar, bio, XP et activite communautaire visible.
        </p>
        <div className="mt-5">
          <Link href="/players" className="rounded-full border border-cyan-700 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
            Retour a la communaute
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[0.9fr_1.1fr]">
        <ProfileCard profile={profile} stats={stats} />

        <section className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-6">
          <h2 className="text-sm font-black uppercase tracking-[0.3em] text-cyan-400">Infos publiques</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Pseudo</p>
              <p className="mt-2 text-lg font-black text-white">{profile.username}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Handle public</p>
              <p className="mt-2 text-lg font-black text-cyan-300">@{profile.public_handle}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">XP public</p>
              <p className="mt-2 text-lg font-black text-white">{profile.xp_points}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Bio</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {profile.bio || 'Ce joueur n a pas encore rempli sa bio publique.'}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Favoris publics</p>
              <p className="mt-2 text-lg font-black text-white">{stats.favoriteCount}</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Commentaires publics</p>
              <p className="mt-2 text-lg font-black text-white">{stats.commentCount}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

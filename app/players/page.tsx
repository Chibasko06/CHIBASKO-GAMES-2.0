import type { Metadata } from 'next'
import PlayersDirectory from '@/components/PlayersDirectory'
import { getPublicProfiles } from '@/lib/queries/profiles'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Communaute',
  description:
    'Explore les profils publics des joueurs de Chibasko Games, leurs bios, leur XP et leur activite visible.',
  path: '/players',
})

export default async function PlayersPage() {
  const profiles = await getPublicProfiles()

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Communaute</p>
        <h1 className="mt-3 text-4xl font-black uppercase text-white">Joueurs publics</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Recherche un joueur, consulte son pseudo, son avatar, sa bio et son XP public.
        </p>
      </div>
      <PlayersDirectory profiles={profiles} />
    </div>
  )
}

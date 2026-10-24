import type { Metadata } from 'next'
import PlayersDirectory from '@/components/PlayersDirectory'
import { getPublicProfilesPage } from '@/lib/queries/profiles'
import {pageNumber} from '@/lib/pagination'
import Link from 'next/link'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Communaute',
  description:
    'Explore les profils publics des joueurs de Chibasko Games, leurs bios et leur activite visible.',
  path: '/players',
})

export default async function PlayersPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const query=await searchParams,search=typeof query.search==='string'?query.search.slice(0,80):'',page=pageNumber(query.page)
  const profiles = await getPublicProfilesPage(search,page)

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Communaute</p>
        <h1 className="mt-3 text-4xl font-black uppercase text-white">Joueurs publics</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Recherche un joueur, consulte son pseudo, son avatar et sa bio.
        </p>
      </div>
      <form action="/players" className="flex gap-3"><label className="flex-1">Rechercher un joueur<input name="search" defaultValue={search} maxLength={80} className="block w-full rounded border border-zinc-700 bg-black p-3" /></label><button type="submit">Rechercher</button></form>
      <PlayersDirectory profiles={profiles.items} hideSearch />
      <nav aria-label="Pages des joueurs" className="flex justify-center gap-6">{page>1&&<Link href={`/players?search=${encodeURIComponent(search)}&page=${page-1}`}>Précédent</Link>}{page*24<profiles.total&&<Link href={`/players?search=${encodeURIComponent(search)}&page=${page+1}`}>Suivant</Link>}</nav>
    </div>
  )
}

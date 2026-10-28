import PlayersDirectory from '@/components/PlayersDirectory'
import { getViewerProfilesPage } from '@/lib/server/publicProfiles'
import { pageNumber } from '@/lib/pagination'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { buildPageMetadata } from '@/lib/seo'
export const dynamic = 'force-dynamic'
export const metadata = buildPageMetadata({ title: 'Communauté', description: 'Découvrez les joueurs et développeurs de Chibasko Games et leurs profils publics.', path: '/players' })
export default async function PlayersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams, search = typeof query.search === 'string' ? query.search.slice(0, 80) : '', page = pageNumber(query.page)
  const role = query.role === 'developer' || query.role === 'admin' ? query.role : 'all'
  const profiles = await getViewerProfilesPage(search, page, role), pages = Math.max(1, Math.ceil(profiles.total / 24))
  const href = (number: number) => '/players?' + new URLSearchParams({ search, role, page: String(number) }).toString()
  if (page > pages) redirect(href(pages))
  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <header className="border-b border-zinc-800 pb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-300">Chibasko Games</p>
      <h1 className="text-3xl font-bold sm:text-4xl">Communauté</h1>
      <p className="mt-2 text-sm text-zinc-400">Rencontrez les membres et découvrez les créateurs de jeux.</p>
    </header>
    <form action="/players" className="grid items-end gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-[1fr_auto_auto]">
      <label className="min-w-0 text-sm text-zinc-300">Rechercher un membre<input type="search" name="search" defaultValue={search} maxLength={80} placeholder="Pseudo du membre" className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white focus-visible:outline-2 focus-visible:outline-cyan-300" />
      </label>
      <div>
        <label htmlFor="community-role" className="text-sm text-zinc-300">Rôle</label>
        <select id="community-role" name="role" defaultValue={role} className="mt-2 block min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white">
          <option value="all">Tous les membres</option>
          <option value="developer">Développeurs</option>
          <option value="admin">Administrateurs</option>
        </select>
      </div>
      <button className="min-h-11 rounded-lg bg-cyan-400 px-5 font-semibold text-black" type="submit">Rechercher</button>
    </form>
    <p className="text-sm text-zinc-400">{profiles.total} {profiles.total === 1 ? 'membre' : 'membres'}{search && ' pour « ' + search + ' »'}</p>
    <PlayersDirectory profiles={profiles.items} />
    {pages > 1 && <nav aria-label="Pages de la communauté" className="flex flex-wrap items-center justify-center gap-3 border-t border-zinc-800 pt-5">{page > 1 && <Link href={href(page - 1)} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm">Précédent</Link>}<span className="text-sm text-zinc-400">Page {page} sur {pages}</span>{page < pages && <Link href={href(page + 1)} className="rounded-lg border border-zinc-700 px-4 py-3 text-sm">Suivant</Link>}</nav>}
  </div>
}

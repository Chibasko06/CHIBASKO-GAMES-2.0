import {publicProfilePath} from '@/lib/publicUsername'
import Image from 'next/image'
import Link from 'next/link'
import RoleBadges from '@/components/RoleBadges'
import type { PublicProfile } from '@/lib/queries/profiles'
export default function PlayersDirectory({ profiles }: { profiles: PublicProfile[]; hideSearch?: boolean }) {
  if (!profiles.length) return <div className="rounded-2xl border border-dashed border-zinc-700 px-6 py-12 text-center">
    <h2 className="font-semibold">Aucun membre trouvé</h2>
    <p className="mt-2 text-sm text-zinc-400">Essayez un autre pseudo ou retirez le filtre de rôle.</p>
    <Link href="/players" className="mt-4 inline-block rounded-lg px-4 py-3 text-cyan-300 underline">Voir tous les membres</Link>
  </div>
  return <ul className="grid auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{profiles.map(profile =>
    <li key={profile.id} className="min-w-0">
      <Link href={publicProfilePath(profile.username)} className="group flex h-full min-h-48 flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-5 transition-colors hover:border-cyan-700 focus-visible:outline-2 focus-visible:outline-cyan-300">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-cyan-950 text-lg font-bold text-cyan-200">{profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={48} height={48} unoptimized className="h-full w-full object-cover" /> : profile.username[0]?.toUpperCase()}</div>
          <h2 className="min-w-0 line-clamp-2 break-words font-bold">{profile.username}</h2>
        </div>
        <div className="mt-3 min-h-7">
        <p className="break-words text-xs text-zinc-400">@{profile.username}</p>
        <RoleBadges roles={profile.roles} />
        </div>
        <p className="mb-4 line-clamp-2 break-words text-sm leading-6 text-zinc-400">{profile.bio || 'Aucune biographie renseignée.'}</p>
        <span className="mt-auto text-sm font-medium text-cyan-300">Voir le profil <span aria-hidden="true">↗</span>
        </span>
      </Link>
    </li>)}</ul>
}

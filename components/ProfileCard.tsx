import Image from 'next/image'
import RoleBadges from '@/components/RoleBadges'
import type { ProfileRoles } from '@/lib/profileRoles'
type Profile = { username: string; avatar_url?: string | null; bio?: string | null; roles?: ProfileRoles }
export default function ProfileCard({ profile, stats, heading = 'h2' }: { profile: Profile | null; stats?: { favoriteCount?: number; commentCount: number }; heading?: 'h1' | 'h2' }) {
  const Title = heading
  if (!profile) return <div role="status" className="rounded-2xl border border-zinc-800 p-6">Chargement du profil…</div>
  return <section className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
    <div className="flex items-center gap-4">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-cyan-950 text-2xl font-bold text-cyan-200">{profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={64} height={64} unoptimized className="h-full w-full object-cover" /> : profile.username[0]?.toUpperCase()}</div>
      <div className="min-w-0 space-y-2">
        <Title className="break-words text-xl font-bold text-white">{profile.username}</Title>
        <p className="break-words text-sm text-zinc-400">@{profile.username}</p>
        <RoleBadges roles={profile.roles} />
      </div>
    </div>
    {profile.bio && <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{profile.bio}</p>}
    {stats && <dl className="mt-5 flex flex-wrap gap-6 border-t border-zinc-800 pt-4 text-sm">{stats.favoriteCount !== undefined && <div>
      <dt className="text-zinc-400">Favoris</dt>
      <dd className="mt-1 font-semibold">{stats.favoriteCount}</dd>
    </div>}<div>
        <dt className="text-zinc-400">Commentaires</dt>
        <dd className="mt-1 font-semibold">{stats.commentCount}</dd>
      </div>
    </dl>}
  </section>
}

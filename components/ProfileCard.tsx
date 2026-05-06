type Profile = {
  username: string
  avatar_url?: string | null
  bio?: string | null
  xp_points: number
}

type ProfileStats = {
  favoriteCount: number
  commentCount: number
}

export default function ProfileCard({
  profile,
  stats,
}: {
  profile: Profile | null
  stats: ProfileStats
}) {
  if (!profile) {
    return (
      <div className="rounded-[30px] border border-zinc-800 bg-zinc-900 p-6 text-white animate-pulse">
        Chargement...
      </div>
    )
  }

  const identity = profile.username || 'Joueur'
  const level = Math.floor(profile.xp_points / 100) + 1
  const progress = profile.xp_points % 100

  return (
    <aside className="overflow-hidden rounded-[30px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(8,14,24,0.98),rgba(6,8,12,0.98))]">
      <div className="border-b border-cyan-950/60 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_55%)] p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.35em] text-cyan-300/80">Carte joueur</p>
        <div className="mt-5 flex items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[26px] border border-cyan-400/60 bg-zinc-900 shadow-[0_0_30px_rgba(34,211,238,0.18)]">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={identity} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl font-black text-cyan-300">
                {identity[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-black uppercase text-white">{identity}</h2>
            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.35em] text-cyan-300">
              Niveau {level}
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              {profile.bio || 'Profil joueur pret pour de nouvelles sessions arcade.'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="rounded-[24px] border border-zinc-800 bg-black/35 p-4">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-500">
            <span>Progression XP</span>
            <span>{progress} / 100</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-900">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#22d3ee,#67e8f9)] transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[22px] border border-zinc-800 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Total XP</p>
            <p className="mt-2 text-2xl font-black text-white">{profile.xp_points}</p>
          </div>
          <div className="rounded-[22px] border border-zinc-800 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Favoris</p>
            <p className="mt-2 text-2xl font-black text-white">{stats.favoriteCount}</p>
          </div>
          <div className="col-span-2 rounded-[22px] border border-zinc-800 bg-black/35 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Commentaires publies</p>
            <p className="mt-2 text-2xl font-black text-white">{stats.commentCount}</p>
          </div>
        </div>

        <div className="rounded-[24px] border border-cyan-950/60 bg-cyan-950/10 p-4">
          <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Statut</p>
          <p className="mt-2 text-sm leading-6 text-zinc-300">
            Profil public actif, progression connectee et espace joueur pret pour suivre tes jeux preferes.
          </p>
        </div>
      </div>
    </aside>
  )
}

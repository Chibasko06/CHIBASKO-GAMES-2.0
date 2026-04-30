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
      <div className="rounded-[28px] border border-zinc-800 bg-zinc-900 p-6 text-white animate-pulse">
        Chargement...
      </div>
    )
  }

  const identity = profile.username || 'Joueur'
  const level = Math.floor(profile.xp_points / 100) + 1
  const progress = profile.xp_points % 100

  return (
    <div className="rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(12,16,24,0.98),rgba(7,8,11,0.98))] p-6 text-center">
      <div className="mx-auto mb-5 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-cyan-400/70 bg-zinc-900 shadow-[0_0_25px_rgba(34,211,238,0.15)]">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={identity} className="h-full w-full object-cover" />
        ) : (
          <span className="text-4xl font-black text-cyan-300">
            {identity[0]?.toUpperCase()}
          </span>
        )}
      </div>

      <h2 className="text-2xl font-black uppercase text-white">{identity}</h2>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.35em] text-cyan-300">
        Niveau {level}
      </p>
      <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-zinc-400">
        {profile.bio || 'Profil joueur pret pour de nouvelles sessions arcade.'}
      </p>

      <div className="mt-6 w-full space-y-2">
        <div className="flex justify-between text-[10px] font-bold uppercase text-zinc-500">
          <span>Progression</span>
          <span>{progress} / 100 XP</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full rounded-full bg-cyan-400 transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 text-left">
        <div className="rounded-2xl border border-zinc-800 bg-black/35 p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Total XP</p>
          <p className="mt-2 text-lg font-black text-white">{profile.xp_points}</p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-black/35 p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Favoris</p>
          <p className="mt-2 text-lg font-black text-white">{stats.favoriteCount}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-zinc-800 bg-black/35 p-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Commentaires publies</p>
          <p className="mt-2 text-lg font-black text-white">{stats.commentCount}</p>
        </div>
      </div>
    </div>
  )
}

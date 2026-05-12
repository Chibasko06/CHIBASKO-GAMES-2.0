"use client";

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { PublicProfile } from '@/lib/queries/profiles'

export default function PlayersDirectory({
  profiles,
}: {
  profiles: PublicProfile[]
}) {
  const [query, setQuery] = useState('')

  const visibleProfiles = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return profiles
    }

    return profiles.filter((profile) => profile.username.toLowerCase().includes(normalizedQuery))
  }, [profiles, query])

  return (
    <div className="space-y-6">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher un joueur par pseudo"
        className="w-full rounded-2xl border border-zinc-800 bg-black/50 p-4 text-white outline-none focus:border-cyan-500"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleProfiles.map((profile) => (
          <Link
            key={profile.id}
            href={`/players/@${profile.public_handle}`}
            className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-5 transition hover:border-cyan-800"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-cyan-700 bg-zinc-900">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.username}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-black text-cyan-300">{profile.username[0]?.toUpperCase()}</span>
                )}
              </div>
              <div>
                <p className="font-black uppercase text-white">{profile.username}</p>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-300">@{profile.public_handle}</p>
                <p className="text-sm text-cyan-300">{profile.xp_points} XP</p>
              </div>
            </div>
            <p className="mt-4 line-clamp-3 text-sm leading-6 text-zinc-400">
              {profile.bio || 'Aucune bio publique pour le moment.'}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}

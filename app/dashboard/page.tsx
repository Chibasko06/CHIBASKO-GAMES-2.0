"use client";

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import ProfileCard from '@/components/ProfileCard'
import { getFavoriteGames } from '@/lib/queries/favorites'
import { getRecentPlayHistory } from '@/lib/queries/history'
import { uploadOwnAvatar } from '@/lib/avatarUpload'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'
import { Tables } from '@/types/database'

type Profile = Tables<'profiles'>
type FavoriteEntry = Awaited<ReturnType<typeof getFavoriteGames>>[number]
type HistoryEntry = Awaited<ReturnType<typeof getRecentPlayHistory>>[number]

export default function DashboardPage() {
  const pathname = usePathname()
  const { loading: authLoading, session, user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null)
  const [draftProfile, setDraftProfile] = useState<{ username: string; bio: string }>({
    username: '',
    bio: '',
  })
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [commentCount, setCommentCount] = useState(0)
  const [recentFavorites, setRecentFavorites] = useState<FavoriteEntry[]>([])
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async () => {
      const requestId = ++requestIdRef.current

      if (!user) {
        if (mounted && requestId === requestIdRef.current) {
          setNeedsAuth(!authLoading)
          setLoading(authLoading)
        }
        return
      }

      if (!session) {
        return
      }

      await ensureProfile(session)
      await supabase.rpc('sync_profile_xp')

      const [
        { data: profileData },
        favoriteEntries,
        historyEntries,
        { count: favoritesTotal },
        { count: reviewsTotal },
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        getFavoriteGames(user.id),
        getRecentPlayHistory(user.id, 6),
        supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('game_reviews').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      if (mounted && requestId === requestIdRef.current) {
        setNeedsAuth(false)
        setProfile(profileData)
        setSavedProfile(profileData)
        setDraftProfile({
          username: profileData?.username || '',
          bio: profileData?.bio || '',
        })
        setFavoriteCount(favoritesTotal ?? 0)
        setCommentCount(reviewsTotal ?? 0)
        setRecentFavorites(favoriteEntries.slice(0, 4))
        setRecentHistory(historyEntries)
        setLoading(false)
      }
    }

    const handleFavoritesUpdate = () => {
      void loadDashboard()
    }

    const handleFocus = () => {
      void loadDashboard()
    }

    void loadDashboard()
    window.addEventListener('favorites-updated', handleFavoritesUpdate)
    window.addEventListener('focus', handleFocus)

    return () => {
      mounted = false
      window.removeEventListener('favorites-updated', handleFavoritesUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [authLoading, pathname, session, user])

  const handleProfileSave = async () => {
    if (!user || !profile || !session?.access_token) {
      return
    }

    setSavingProfile(true)
    setProfileMessage(null)
    const normalizedUsername = draftProfile.username.trim()

    const response = await fetch('/api/profile/public', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        username: normalizedUsername,
        bio: draftProfile.bio.trim(),
      }),
    })

    const payload = await response.json().catch(() => null)

    if (!response.ok || !payload?.profile) {
      setProfileMessage(payload?.error || 'Impossible de mettre a jour ton profil.')
      setSavingProfile(false)
      return
    }

    const data = payload.profile as Profile

    setProfile(data)
    setSavedProfile(data)
    setDraftProfile({
      username: data.username || '',
      bio: data.bio || '',
    })
    setIsEditingProfile(false)
    setProfileMessage('Profil mis a jour.')
    setSavingProfile(false)
  }

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file || !profile) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setProfileMessage('Choisis une vraie image pour ton avatar.')
      return
    }

    if (!user) {
      setProfileMessage('Connecte-toi pour importer un avatar.')
      return
    }

    setUploadingAvatar(true)
    setProfileMessage(null)

    try {
      const avatarUrl = await uploadOwnAvatar(file)
      const { data: updatedProfile, error } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
        .select('*')
        .single()

      if (error) {
        throw error
      }

      setProfile(updatedProfile)
      setSavedProfile(updatedProfile)
      setDraftProfile((current) => ({
        ...current,
        username: updatedProfile.username || current.username,
        bio: updatedProfile.bio || '',
      }))
      setProfileMessage('Avatar mis a jour.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Impossible d envoyer l avatar.')
    } finally {
      setUploadingAvatar(false)
      event.target.value = ''
    }
  }

  if (!loading && needsAuth) {
    return (
      <main className="min-h-screen p-2">
        <div className="max-w-2xl rounded-[28px] border border-zinc-800 bg-zinc-950 p-6 space-y-4">
          <h1 className="text-2xl font-black uppercase text-white">Dashboard joueur</h1>
          <p className="text-zinc-400">
            Le dashboard et l&apos;XP sont reserves aux membres connectes sur leur compte ChibaskoGames.
          </p>
          <div className="flex gap-4">
            <Link href="/login" className="rounded-full bg-cyan-400 px-5 py-3 font-bold text-black">
              Connexion
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="space-y-8">
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-6">
          <ProfileCard profile={profile} stats={{ favoriteCount, commentCount }} />

          <section className="rounded-[30px] border border-zinc-800 bg-[linear-gradient(180deg,rgba(14,18,28,0.96),rgba(9,9,11,0.98))] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Securite</p>
                <h2 className="mt-2 text-2xl font-black uppercase text-white">Compte protege</h2>
              </div>
              <span className="rounded-full border border-cyan-900 bg-black/25 px-3 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">
                code email
              </span>
            </div>

            <div className="mt-5 rounded-[24px] border border-zinc-800 bg-black/35 p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Email du compte</p>
              <p className="mt-3 text-base font-bold text-white">{user?.email || 'Email indisponible'}</p>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Si tu oublies ton mot de passe, tu peux maintenant demander un code de confirmation puis definir un nouveau mot de passe directement sur le site.
              </p>
              <Link
                href={user?.email ? `/reset-password?email=${encodeURIComponent(user.email)}` : '/reset-password'}
                className="mt-5 inline-flex rounded-full border border-cyan-700 bg-cyan-950/20 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-cyan-200"
              >
                Ouvrir le reset
              </Link>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[30px] border border-zinc-800 bg-[linear-gradient(180deg,rgba(17,24,39,0.92),rgba(9,9,11,0.95))] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Profil public</p>
                <h2 className="mt-2 text-2xl font-black uppercase text-white">Identite joueur</h2>
              </div>
              {!isEditingProfile && profile ? (
                <button
                  type="button"
                  onClick={() => {
                    setDraftProfile({
                      username: profile.username || '',
                      bio: profile.bio || '',
                    })
                    setProfileMessage(null)
                    setIsEditingProfile(true)
                  }}
                  className="rounded-full border border-cyan-800 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-cyan-300"
                  title="Editer mon profil"
                >
                  Editer
                </button>
              ) : null}
            </div>

            {profile ? (
              isEditingProfile ? (
                <div className="mt-6 space-y-4">
                  <div className="rounded-[26px] border border-cyan-950/60 bg-black/30 p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                      <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-cyan-400/60 bg-zinc-900">
                        {profile.avatar_url ? (
                          <Image
                            src={profile.avatar_url}
                            alt={profile.username}
                            width={96}
                            height={96}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-3xl font-black text-cyan-300">
                            {(draftProfile.username || profile.username || 'J')[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Apercu public</p>
                        <p className="mt-2 truncate text-xl font-black uppercase text-white">
                          {draftProfile.username || 'Pseudo joueur'}
                        </p>
                        <p className="mt-3 text-sm leading-6 text-zinc-400">
                          {draftProfile.bio || 'Ta bio apparaitra ici une fois enregistree.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_0.8fr]">
                    <input
                      value={draftProfile.username}
                      onChange={(event) => setDraftProfile((current) => ({ ...current, username: event.target.value }))}
                      placeholder="Pseudo"
                      className="rounded-[22px] border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
                    />
                    <label className="flex min-h-[60px] cursor-pointer items-center justify-between rounded-[22px] border border-zinc-800 bg-black/60 px-4 text-sm text-zinc-300 transition hover:border-cyan-700">
                      <span>{uploadingAvatar ? 'Envoi de l avatar...' : 'Importer un avatar'}</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                      <span className="rounded-full border border-cyan-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">
                        Choisir
                      </span>
                    </label>
                  </div>

                  <textarea
                    value={draftProfile.bio}
                    onChange={(event) => setDraftProfile((current) => ({ ...current, bio: event.target.value }))}
                    placeholder="Bio"
                    className="min-h-36 rounded-[22px] border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="text-zinc-400">
                      {savingProfile ? 'Sauvegarde du profil...' : profileMessage || 'Ajuste ton profil puis valide quand le rendu te plait.'}
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftProfile({
                            username: savedProfile?.username || '',
                            bio: savedProfile?.bio || '',
                          })
                          setIsEditingProfile(false)
                          setProfileMessage('Modifications annulees.')
                        }}
                        className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-200"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleProfileSave()}
                        disabled={savingProfile || !draftProfile.username.trim()}
                        className="rounded-full bg-cyan-400 px-5 py-2 text-xs font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Sauvegarder
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-[24px] border border-zinc-800 bg-black/35 p-5">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Pseudo public</p>
                    <p className="mt-3 text-2xl font-black uppercase text-white">{profile.username}</p>
                    <p className="mt-2 text-sm font-bold uppercase tracking-[0.14em] text-cyan-300">@{profile.public_handle}</p>
                    <p className="mt-4 text-sm leading-6 text-zinc-400">
                      C est ce pseudo qui apparait dans la communaute et sur tes commentaires.
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-zinc-800 bg-black/35 p-5">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Avatar actuel</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[18px] border border-cyan-700 bg-zinc-900">
                        {profile.avatar_url ? (
                          <Image
                            src={profile.avatar_url}
                            alt={profile.username}
                            width={64}
                            height={64}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-lg font-black text-cyan-300">{profile.username[0]?.toUpperCase()}</span>
                        )}
                      </div>
                      <p className="text-sm leading-6 text-zinc-300">
                        {profile.avatar_url ? 'Avatar personalise actif sur ton compte.' : 'Aucun avatar personnalise pour le moment.'}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-zinc-800 bg-black/35 p-5 lg:col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Bio</p>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">
                      {profile.bio || 'Aucune bio pour le moment. Donne une petite couleur a ton profil pour le rendre plus vivant.'}
                    </p>
                  </div>
                  {profileMessage ? <div className="lg:col-span-2 text-sm text-cyan-300">{profileMessage}</div> : null}
                </div>
              )
            ) : (
              <p className="mt-5 text-zinc-500">Chargement du profil...</p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-[30px] border border-zinc-800 bg-zinc-950 p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Collection</p>
                  <h2 className="mt-2 text-2xl font-black uppercase text-white">Favoris recents</h2>
                </div>
                <Link href="/favorites" className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-cyan-400">
                  Voir tout
                </Link>
              </div>

              {recentFavorites.length > 0 ? (
                <div className="space-y-3">
                  {recentFavorites.map((entry) => (
                    <Link
                      key={entry.favoriteId}
                      href={`/games/${entry.game.slug}`}
                      className="grid grid-cols-[88px_1fr] gap-4 rounded-[22px] border border-zinc-800 bg-black/30 p-3 transition hover:border-cyan-800"
                    >
                      {entry.game.thumbnail_url ? (
                        <Image
                          src={entry.game.thumbnail_url}
                          alt={entry.game.title}
                          width={96}
                          height={80}
                          unoptimized
                          className="h-20 w-24 rounded-[16px] object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-24 items-center justify-center rounded-[16px] bg-zinc-900 text-cyan-300">
                          {entry.game.title[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-white">{entry.game.title}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Selection perso</p>
                        <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                          {entry.game.description || 'Pret a relancer depuis tes favoris.'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Aucun favori enregistre pour le moment.</p>
              )}
            </div>

            <div className="rounded-[30px] border border-zinc-800 bg-zinc-950 p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Activite</p>
                  <h2 className="mt-2 text-2xl font-black uppercase text-white">Derniers jeux vus</h2>
                </div>
                <Link href="/games" className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400 hover:text-cyan-400">
                  Explorer
                </Link>
              </div>

              {recentHistory.length > 0 ? (
                <div className="space-y-3">
                  {recentHistory.map((entry) => (
                    <Link
                      key={entry.historyId}
                      href={`/games/${entry.game.slug}`}
                      className="grid grid-cols-[88px_1fr] gap-4 rounded-[22px] border border-zinc-800 bg-black/30 p-3 transition hover:border-cyan-800"
                    >
                      {entry.game.thumbnail_url ? (
                        <Image
                          src={entry.game.thumbnail_url}
                          alt={entry.game.title}
                          width={96}
                          height={80}
                          unoptimized
                          className="h-20 w-24 rounded-[16px] object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-24 items-center justify-center rounded-[16px] bg-zinc-900 text-cyan-300">
                          {entry.game.title[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-base font-black text-white">{entry.game.title}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-cyan-300">Vu recemment</p>
                        <p className="mt-2 text-sm text-zinc-400">
                          {entry.played_at ? new Date(entry.played_at).toLocaleString('fr-FR') : 'Vue enregistree'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Aucune visite enregistree pour le moment.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}

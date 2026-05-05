"use client";

import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ProfileCard from '@/components/ProfileCard'
import { getFavoriteGames } from '@/lib/queries/favorites'
import { getRecentPlayHistory } from '@/lib/queries/history'
import { uploadOwnAvatar } from '@/lib/avatarUpload'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'
import { Database, Tables } from '@/types/database'

type Profile = Tables<'profiles'>
type FavoriteEntry = Awaited<ReturnType<typeof getFavoriteGames>>[number]
type HistoryEntry = Awaited<ReturnType<typeof getRecentPlayHistory>>[number]

type PasswordForm = {
  currentPassword: string
  nextPassword: string
  confirmPassword: string
}

const emptyPasswordForm: PasswordForm = {
  currentPassword: '',
  nextPassword: '',
  confirmPassword: '',
}

export default function DashboardPage() {
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profileMessage, setProfileMessage] = useState<string | null>(null)
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null)
  const [favoriteCount, setFavoriteCount] = useState(0)
  const [commentCount, setCommentCount] = useState(0)
  const [recentFavorites, setRecentFavorites] = useState<FavoriteEntry[]>([])
  const [recentHistory, setRecentHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [passwordForm, setPasswordForm] = useState<PasswordForm>(emptyPasswordForm)
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    let mounted = true

    const loadDashboard = async () => {
      const requestId = ++requestIdRef.current
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (mounted && requestId === requestIdRef.current) {
          setNeedsAuth(true)
          setLoading(false)
        }
        return
      }

      await ensureProfile()
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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadDashboard()
    })

    return () => {
      mounted = false
      window.removeEventListener('favorites-updated', handleFavoritesUpdate)
      window.removeEventListener('focus', handleFocus)
      subscription.unsubscribe()
    }
  }, [pathname])

  useEffect(() => {
    if (!profile || !savedProfile) {
      return
    }

    if (
      profile.username === savedProfile.username &&
      (profile.bio || '') === (savedProfile.bio || '')
    ) {
      return
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current)
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      void (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          return
        }

        setSavingProfile(true)
        const normalizedUsername = profile.username.trim()

        const { error, data } = await supabase
          .from('profiles')
          .update({
            username: normalizedUsername,
            display_name: normalizedUsername,
            bio: profile.bio || null,
          })
          .eq('id', user.id)
          .select('*')
          .single()

        if (error) {
          setProfileMessage(error.message)
          setSavingProfile(false)
          return
        }

        setProfile(data)
        setSavedProfile(data)
        setProfileMessage('Profil enregistre automatiquement.')
        setSavingProfile(false)
      })()
    }, 700)

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current)
      }
    }
  }, [profile, savedProfile])

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file || !profile) {
      return
    }

    if (!file.type.startsWith('image/')) {
      setProfileMessage('Choisis une vraie image pour ton avatar.')
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

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
      setProfileMessage('Avatar mis a jour.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Impossible d envoyer l avatar.')
    } finally {
      setUploadingAvatar(false)
      event.target.value = ''
    }
  }

  const handlePasswordChange = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordMessage(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user?.email) {
      setPasswordMessage('Impossible de verifier ton compte.')
      return
    }

    if (!passwordForm.currentPassword || !passwordForm.nextPassword || !passwordForm.confirmPassword) {
      setPasswordMessage('Remplis tous les champs de securite.')
      return
    }

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setPasswordMessage('Les deux nouveaux mots de passe doivent etre identiques.')
      return
    }

    if (passwordForm.nextPassword.length < 8) {
      setPasswordMessage('Le nouveau mot de passe doit faire au moins 8 caracteres.')
      return
    }

    setSavingPassword(true)

    const verificationClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const { error: verifyError } = await verificationClient.auth.signInWithPassword({
      email: user.email,
      password: passwordForm.currentPassword,
    })

    await verificationClient.auth.signOut()

    if (verifyError) {
      setPasswordMessage('Ancien mot de passe incorrect.')
      setSavingPassword(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: passwordForm.nextPassword,
    })

    if (updateError) {
      setPasswordMessage(updateError.message)
      setSavingPassword(false)
      return
    }

    setPasswordForm(emptyPasswordForm)
    setPasswordMessage('Mot de passe mis a jour.')
    setSavingPassword(false)
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
      <section className="rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(135deg,rgba(10,15,23,0.98),rgba(10,10,12,0.98))] p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/75">Espace joueur</p>
        <h1 className="mt-3 text-3xl font-black uppercase text-white md:text-4xl">Tableau de bord</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
          Gere ton pseudo, ton avatar, ton mot de passe et retrouve rapidement tes favoris et
          tes derniers jeux vus.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <ProfileCard profile={profile} stats={{ favoriteCount, commentCount }} />

        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Total XP</p>
              <p className="mt-2 text-3xl font-black text-cyan-400">{profile?.xp_points ?? 0}</p>
            </div>
            <div className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Favoris</p>
              <p className="mt-2 text-3xl font-black text-cyan-400">{favoriteCount}</p>
            </div>
            <div className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Commentaires</p>
              <p className="mt-2 text-3xl font-black text-cyan-400">{commentCount}</p>
            </div>
          </div>

          <section className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-cyan-400">Mon profil</h2>
            {profile ? (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <input
                  value={profile.username || ''}
                  onChange={(event) => setProfile((current) => current ? { ...current, username: event.target.value } : current)}
                  placeholder="Pseudo"
                  className="rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
                />
                <label className="flex min-h-[60px] cursor-pointer items-center justify-between rounded-2xl border border-zinc-800 bg-black/60 px-4 text-sm text-zinc-300 transition hover:border-cyan-700">
                  <span>{uploadingAvatar ? 'Envoi de l avatar...' : 'Choisir un avatar rond'}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  <span className="rounded-full border border-cyan-700 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan-300">
                    Importer
                  </span>
                </label>
                <textarea
                  value={profile.bio || ''}
                  onChange={(event) => setProfile((current) => current ? { ...current, bio: event.target.value } : current)}
                  placeholder="Bio"
                  className="min-h-32 rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500 md:col-span-2"
                />
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="text-zinc-400">
                    {savingProfile ? 'Enregistrement automatique...' : profileMessage || 'Les modifications sont enregistrees automatiquement.'}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (savedProfile) {
                        setProfile(savedProfile)
                        setProfileMessage('Profil revenu aux valeurs enregistrees.')
                      }
                    }}
                    className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-zinc-200"
                  >
                    Annuler mes changements
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-5 text-zinc-500">Chargement du profil...</p>
            )}
          </section>

          <section className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-cyan-400">Securite du compte</h2>
            <form onSubmit={handlePasswordChange} className="mt-5 grid grid-cols-1 gap-4">
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                placeholder="Ancien mot de passe"
                className="rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
              />
              <input
                type="password"
                value={passwordForm.nextPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, nextPassword: event.target.value }))}
                placeholder="Nouveau mot de passe"
                className="rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
              />
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Confirmer le nouveau mot de passe"
                className="rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
              />
              {passwordMessage ? (
                <p className="text-sm text-cyan-300">{passwordMessage}</p>
              ) : null}
              <button
                type="submit"
                disabled={savingPassword}
                className="rounded-full border border-cyan-700 py-4 font-black uppercase tracking-[0.2em] text-cyan-200 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {savingPassword ? 'Verification...' : 'Changer le mot de passe'}
              </button>
            </form>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-cyan-400">Favoris recents</h2>
            <Link href="/favorites" className="text-xs text-zinc-400 hover:text-cyan-400">
              Voir tout
            </Link>
          </div>

          {recentFavorites.length > 0 ? (
            <div className="space-y-3">
              {recentFavorites.map((entry) => (
                <Link
                  key={entry.favoriteId}
                  href={`/games/${entry.game.slug}`}
                  className="block rounded-2xl border border-zinc-800 bg-black/30 p-4 hover:border-cyan-800 transition-colors"
                >
                  <p className="font-bold text-white">{entry.game.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">Ajoute a ta selection perso</p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Aucun favori enregistre pour le moment.</p>
          )}
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-cyan-400">Derniers jeux vus</h2>
            <Link href="/games" className="text-xs text-zinc-400 hover:text-cyan-400">
              Explorer
            </Link>
          </div>

          {recentHistory.length > 0 ? (
            <div className="space-y-3">
              {recentHistory.map((entry) => (
                <Link
                  key={entry.historyId}
                  href={`/games/${entry.game.slug}`}
                  className="block rounded-2xl border border-zinc-800 bg-black/30 p-4 hover:border-cyan-800 transition-colors"
                >
                  <p className="font-bold text-white">{entry.game.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {entry.played_at
                      ? new Date(entry.played_at).toLocaleString('fr-FR')
                      : 'Vue enregistree'}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">Aucune visite enregistree pour le moment.</p>
          )}
        </section>
      </div>
    </main>
  )
}

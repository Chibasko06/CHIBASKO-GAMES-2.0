"use client";

import {publicProfilePath} from '@/lib/publicUsername'

import FormField from '@/components/ui/FormField'
import AccountDeletion from '@/components/AccountDeletion'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import RoleBadges from '@/components/RoleBadges'
import { getCommunityProfilesPage } from '@/lib/queries/profiles'
import { NO_PROFILE_ROLES, type ProfileRoles } from '@/lib/profileRoles'
import { getFavoriteGames, getFavoriteGamesPage } from '@/lib/queries/favorites'
import { getRecentPlayHistory } from '@/lib/queries/history'
import { removeOwnAvatar, uploadOwnAvatar } from '@/lib/avatarUpload'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'
import { readData } from '@/lib/dataAccess'
import { fetchJson, withTimeout } from '@/lib/asyncOperation'
import { Tables } from '@/types/database'

type Profile = Tables<'profiles'>
type FavoriteEntry = Awaited<ReturnType<typeof getFavoriteGames>>[number]
type HistoryEntry = Awaited<ReturnType<typeof getRecentPlayHistory>>[number]

export default function DashboardPage() {
  const pathname = usePathname()
  const { loading: authLoading, session, user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [roles, setRoles] = useState<ProfileRoles>(NO_PROFILE_ROLES)
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
  const [loadError, setLoadError] = useState<string | null>(null)
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

      try {
        setLoadError(null)
        setLoading(true)
        await ensureProfile(session)

        const [
          { data: profileData },
          favoriteEntries,
          historyEntries,
          { count: favoritesTotal },
          { count: reviewsTotal },
          publicRoles,
        ] = await withTimeout(Promise.all([
          readData('dashboard_profile', supabase.from('profiles').select('id, username, display_name, avatar_url, bio, created_at').eq('id', user.id).single()),
          getFavoriteGamesPage(user.id, 1).then(page => page.entries),
          getRecentPlayHistory(user.id, 6),
          readData('dashboard_favorites_count', supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', user.id)),
          readData('dashboard_reviews_count', supabase.from('game_reviews').select('*', { count: 'exact', head: true }).eq('user_id', user.id)),
          getCommunityProfilesPage('', 1, 'all', user.id),
        ]))

        if (mounted && requestId === requestIdRef.current) {
          setNeedsAuth(false)
          setProfile(profileData)
          setRoles(publicRoles.items[0]?.roles ?? NO_PROFILE_ROLES)
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
      } catch {
        if (mounted && requestId === requestIdRef.current) setLoadError('Impossible de charger le profil et ses données. Réessaie dans un instant.')
      } finally {
        if (mounted && requestId === requestIdRef.current) setLoading(false)
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

  useEffect(() => {
    if (isEditingProfile) document.getElementById('profile-username')?.focus()
  }, [isEditingProfile])

  const handleProfileSave = async () => {
    if (!user || !profile || !session?.access_token) {
      return
    }

    setSavingProfile(true)
    setProfileMessage(null)
    const normalizedUsername = draftProfile.username.trim()

    try {
      const { response, payload } = await fetchJson('/api/profile/public', {
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
    } catch {
      setProfileMessage('La sauvegarde n’a pas pu être confirmée. Recharge le profil avant de réessayer.')
    } finally { setSavingProfile(false) }
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
      const updatedProfile = await uploadOwnAvatar(file)

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

  const handleAvatarDelete = async () => {
    if (!user || !profile || uploadingAvatar) return
    setUploadingAvatar(true)
    setProfileMessage(null)
    try {
      const updatedProfile = await removeOwnAvatar()
      setProfile(updatedProfile)
      setSavedProfile(updatedProfile)
      setProfileMessage('Avatar supprime.')
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Impossible de supprimer l avatar.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  if (loadError && !authLoading && user) return <div role="alert" className="space-y-4 rounded-2xl border border-zinc-800 p-6">
    <p>{loadError}</p>
    <button type="button" className="rounded-lg px-4 py-3 text-cyan-300 underline" onClick={() => window.dispatchEvent(new Event('focus'))}>Réessayer</button>
  </div>
  if (!authLoading && (!user || needsAuth)) return <section className="mx-auto max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
    <h1 className="text-2xl font-bold">Tableau de bord</h1>
    <p className="my-4 text-sm text-zinc-400">Connectez-vous à Chibasko Games pour retrouver votre profil et vos jeux.</p>
    <Link href="/login" className="inline-block rounded-lg bg-cyan-400 px-5 py-3 font-semibold text-black">Connexion</Link>
  </section>
  if (loading || authLoading || !profile || profile.id !== user?.id) return <div role="status" className="space-y-5">
    <h1 className="text-3xl font-bold">Tableau de bord</h1>
    <p className="text-zinc-400">Chargement de votre espace…</p>
    <div aria-hidden="true" className="h-64 rounded-2xl border border-zinc-800 bg-zinc-950 motion-safe:animate-pulse" />
  </div>
  const button = 'inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-cyan-600 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40'
  return <div className="mx-auto w-full max-w-6xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-800 pb-6">
      <div>
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Tableau de bord</h1>
        <p className="mt-2 text-sm text-zinc-400">Votre profil, vos jeux et les réglages de votre compte Chibasko Games.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => setIsEditingProfile(true)}>Modifier le profil</button>
        <Link href={publicProfilePath(profile.username)} className={button}>Voir mon profil public <span aria-hidden="true" className="ml-2">↗</span>
        </Link>
      </div>
    </header>
    <dl className="grid grid-cols-2 gap-3">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <dt className="text-sm text-zinc-400">Favoris</dt>
        <dd className="text-2xl font-bold text-cyan-200">{favoriteCount}</dd>
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
        <dt className="text-sm text-zinc-400">Commentaires</dt>
        <dd className="text-2xl font-bold text-white">{commentCount}</dd>
      </div>
    </dl>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6" aria-labelledby="my-profile-title">
        <h2 id="my-profile-title" className="mb-5 text-lg font-bold">Mon profil</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-cyan-950 text-3xl font-bold text-cyan-200">{profile.avatar_url ? <Image src={profile.avatar_url} alt="" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : profile.username[0]?.toUpperCase()}</div>
          <div className="min-w-0 space-y-2">
            <p className="break-words text-xl font-bold">{profile.username}</p>
            <RoleBadges roles={roles} />
          </div>
        </div>
        {isEditingProfile ? <form onSubmit={event => { event.preventDefault(); if (!savingProfile && !uploadingAvatar) void handleProfileSave() }} className="mt-5 space-y-4">
          <FormField label="Pseudo" descriptionId="profile-username-help">
            <input id="profile-username" minLength={3} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,30}[A-Za-z0-9]" aria-describedby="profile-username-help" value={draftProfile.username} maxLength={32} required onChange={event => setDraftProfile(current => ({ ...current, username: event.target.value }))} className="min-h-11 w-full rounded-lg border border-zinc-700 bg-black px-3 text-white" />
          </FormField>
          <p id="profile-username-help" className="text-xs text-zinc-400">Identifiant @pseudo : 3 à 32 caractères sans accent ni espace. Les anciens pseudos restent réservés à ton compte.</p>
          <FormField label="Biographie">
            <textarea value={draftProfile.bio} maxLength={16384} rows={4} onChange={event => setDraftProfile(current => ({ ...current, bio: event.target.value }))} className="w-full resize-y rounded-lg border border-zinc-700 bg-black p-3 text-white" />
          </FormField>
          <div className="flex flex-wrap items-center gap-3">
            <label className={button + ' cursor-pointer focus-within:outline-2 focus-within:outline-cyan-300'}>{uploadingAvatar ? 'Envoi de l’avatar…' : 'Importer un avatar'}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon" disabled={uploadingAvatar || savingProfile} className="sr-only" onChange={handleAvatarUpload} />
            </label>{profile.avatar_url && <button type="button" className={button} disabled={uploadingAvatar || savingProfile} onClick={() => void handleAvatarDelete()}>Supprimer l’avatar</button>}</div>
          <p className="text-xs text-zinc-500">Votre pseudo, votre avatar et votre biographie sont publics.</p>
          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
            <button type="button" className={button} disabled={savingProfile || uploadingAvatar} onClick={() => { setDraftProfile({ username: savedProfile?.username || '', bio: savedProfile?.bio || '' }); setIsEditingProfile(false); setProfileMessage(null) }}>Annuler</button>
            <button type="submit" className={button + ' border-cyan-500 bg-cyan-400 !text-black'} disabled={savingProfile || uploadingAvatar || !draftProfile.username.trim()}>{savingProfile ? 'Sauvegarde…' : 'Sauvegarder'}</button>
          </div>
        </form> : <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{profile.bio || 'Ajoutez une biographie pour vous présenter à la communauté.'}</p>}
        {profileMessage && <p role="status" className="mt-4 break-words text-sm text-cyan-200">{profileMessage}</p>}
      </section>
      <section className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6" aria-labelledby="security-title">
        <h2 id="security-title" className="text-lg font-bold">Compte et sécurité</h2>
        <dl className="my-5 space-y-4 text-sm">
          <div>
            <dt className="text-zinc-500">Adresse e-mail privée</dt>
            <dd className="mt-1 break-all text-zinc-200">{user?.email}</dd>
          </div>{profile.created_at && <div>
            <dt className="text-zinc-500">Membre depuis</dt>
            <dd className="mt-1 text-zinc-200">{new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</dd>
          </div>}</dl>
        <Link href="/reset-password" className={button + ' w-full'}>Réinitialiser mon mot de passe</Link>
      </section>
    </div>
    <section aria-labelledby="my-games-title" className="space-y-4">
      <h2 id="my-games-title" className="text-xl font-bold">Mes jeux</h2>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold">Favoris récents</h3>
            <Link href="/favorites" className="rounded px-2 py-3 text-sm text-cyan-300">Tous mes favoris ↗</Link>
          </div>
          {recentFavorites.length ? <ul className="space-y-2">{recentFavorites.map(entry =>
            <li key={entry.favoriteId}>
              <Link href={'/games/' + entry.game.slug} className="flex min-w-0 items-center gap-3 rounded-xl border border-transparent p-2 hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-cyan-300">{entry.game.thumbnail_url ? <Image src={entry.game.thumbnail_url} alt="" width={80} height={45} unoptimized className="aspect-video w-20 shrink-0 rounded-md object-cover" /> : <span aria-hidden="true" className="flex aspect-video w-20 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-cyan-300">▶</span>}<div className="min-w-0">
                <p className="truncate text-sm font-semibold">{entry.game.title}</p>
                <p className="mt-1 text-xs text-zinc-500">Ajouté le {new Date(entry.created_at).toLocaleDateString('fr-FR')}</p>
              </div>
              </Link>
            </li>)}</ul> : <p className="py-5 text-sm text-zinc-400">Enregistrez des jeux en favoris pour les retrouver ici.</p>}
        </div>
        <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-semibold">Derniers jeux consultés</h3>
            <Link href="/games" className="rounded px-2 py-3 text-sm text-cyan-300">Explorer les jeux ↗</Link>
          </div>
          {recentHistory.length ? <ul className="space-y-2">{recentHistory.map(entry =>
            <li key={entry.historyId}>
              <Link href={'/games/' + entry.game.slug} className="flex min-w-0 items-center gap-3 rounded-xl border border-transparent p-2 hover:border-zinc-700 focus-visible:outline-2 focus-visible:outline-cyan-300">{entry.game.thumbnail_url ? <Image src={entry.game.thumbnail_url} alt="" width={80} height={45} unoptimized className="aspect-video w-20 shrink-0 rounded-md object-cover" /> : <span aria-hidden="true" className="flex aspect-video w-20 shrink-0 items-center justify-center rounded-md bg-zinc-900 text-cyan-300">▶</span>}<div className="min-w-0">
                <p className="truncate text-sm font-semibold">{entry.game.title}</p>
                <p className="mt-1 text-xs text-zinc-500">Consulté le {new Date(entry.played_at).toLocaleDateString('fr-FR')}</p>
              </div>
              </Link>
            </li>)}</ul> : <p className="py-5 text-sm text-zinc-400">Les jeux consultés apparaîtront ici.</p>}
        </div>
      </div>
    </section>
    <div className="border-t border-zinc-800 pt-1">{session?.access_token && <AccountDeletion key={user?.id} accessToken={session.access_token} onAccountRemoved={() => withTimeout(supabase.auth.signOut({ scope: 'local' }), 5000)} />}</div>
  </div>
}

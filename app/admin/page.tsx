"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react'
import { uploadAdminAvatar } from '@/lib/avatarUpload'
import { supabase } from '@/lib/supabaseClient'
import { Tables } from '@/types/database'

type Game = Tables<'games'>
type AdminUser = Tables<'profiles'> & { email: string | null }

type GameFormState = {
  title: string
  slug: string
  game_url: string
  thumbnail_url: string
  description: string
  developer_name: string
  release_date_text: string
  mobile_compatible: string
  technology: string
  provider_name: string
  source_page_url: string
  is_published: boolean
}

type UserFormState = {
  username: string
  avatar_url: string
  bio: string
  xp_points: number
}

type ImportState = {
  dataFilePath: string
  imagesDirectoryPath: string
}

const emptyGameForm: GameFormState = {
  title: '',
  slug: '',
  game_url: '',
  thumbnail_url: '',
  description: '',
  developer_name: '',
  release_date_text: '',
  mobile_compatible: '',
  technology: '',
  provider_name: '',
  source_page_url: '',
  is_published: true,
}

const emptyUserForm: UserFormState = {
  username: '',
  avatar_url: '',
  bio: '',
  xp_points: 0,
}

const defaultImportState: ImportState = {
  dataFilePath:
    'C:\\Users\\chiba\\OneDrive - Université Paris-Saclay\\Documents\\Projet_perso\\CHIBASKO-GAMES\\JavaScript\\game-data.js',
  imagesDirectoryPath:
    'C:\\Users\\chiba\\OneDrive - Université Paris-Saclay\\Documents\\Projet_perso\\CHIBASKO-GAMES\\images',
}

function toGameFormState(game: Game): GameFormState {
  return {
    title: game.title,
    slug: game.slug,
    game_url: game.game_url,
    thumbnail_url: game.thumbnail_url || '',
    description: game.description || '',
    developer_name: game.developer_name || '',
    release_date_text: game.release_date_text || '',
    mobile_compatible: game.mobile_compatible || '',
    technology: game.technology || '',
    provider_name: game.provider_name || '',
    source_page_url: game.source_page_url || '',
    is_published: game.is_published,
  }
}

function toUserFormState(user: AdminUser): UserFormState {
  return {
    username: user.username,
    avatar_url: user.avatar_url || '',
    bio: user.bio || '',
    xp_points: user.xp_points,
  }
}

export default function AdminPage() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [gameForm, setGameForm] = useState<GameFormState>(emptyGameForm)
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm)
  const [editingGameId, setEditingGameId] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [loadingGames, setLoadingGames] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [savingGame, setSavingGame] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [uploadingUserAvatar, setUploadingUserAvatar] = useState(false)
  const [importing, setImporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const [importState, setImportState] = useState<ImportState>(defaultImportState)

  const authorizedFetch = useCallback(async (input: string, init?: RequestInit) => {
    if (!sessionToken) {
      throw new Error('Tu dois etre connecte avec un compte admin.')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${sessionToken}`)

    return fetch(input, {
      ...init,
      headers,
    })
  }, [sessionToken])

  const loadGames = useCallback(async () => {
    setLoadingGames(true)

    try {
      const response = await authorizedFetch('/api/admin/games')
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Acces admin refuse.')
      }

      setGames(payload.games || [])
      setErrorMessage(null)
    } catch (error) {
      setGames([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur admin.')
    } finally {
      setLoadingGames(false)
    }
  }, [authorizedFetch])

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)

    try {
      const response = await authorizedFetch('/api/admin/users')
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Acces admin refuse.')
      }

      setUsers(payload.users || [])
      setErrorMessage(null)
    } catch (error) {
      setUsers([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur admin.')
    } finally {
      setLoadingUsers(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    const bootstrap = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const token = session?.access_token ?? null
      setSessionToken(token)

      if (!token) {
        setLoadingGames(false)
        setLoadingUsers(false)
        setErrorMessage('Connecte-toi avec un compte admin pour acceder a cet espace.')
        return
      }
    }

    void bootstrap()
  }, [])

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!sessionToken) {
      return
    }

    const refreshAdminPanels = async () => {
      await Promise.all([loadGames(), loadUsers()])
    }

    void refreshAdminPanels()
  }, [sessionToken, loadGames, loadUsers])

  const handleGameChange = (field: keyof GameFormState, value: string | boolean) => {
    setGameForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleUserChange = (field: keyof UserFormState, value: string | number) => {
    setUserForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const resetGameForm = () => {
    setGameForm(emptyGameForm)
    setEditingGameId(null)
  }

  const resetUserForm = () => {
    setUserForm(emptyUserForm)
    setEditingUserId(null)
  }

  const handleGameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingGame(true)

    try {
      const endpoint = editingGameId ? `/api/admin/games/${editingGameId}` : '/api/admin/games'
      const method = editingGameId ? 'PATCH' : 'POST'

      const response = await authorizedFetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gameForm),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la sauvegarde du jeu.')
      }

      resetGameForm()
      await loadGames()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de la sauvegarde du jeu.')
    } finally {
      setSavingGame(false)
    }
  }

  const handleUserSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!editingUserId) {
      setErrorMessage('Selectionne un utilisateur a modifier.')
      return
    }

    setSavingUser(true)

    try {
      const response = await authorizedFetch(`/api/admin/users/${editingUserId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userForm),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la mise a jour de l utilisateur.')
      }

      await loadUsers()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de la mise a jour de l utilisateur.')
    } finally {
      setSavingUser(false)
    }
  }

  const startEditGame = (game: Game) => {
    setEditingGameId(game.id)
    setGameForm(toGameFormState(game))
    setErrorMessage(null)
  }

  const startEditUser = (user: AdminUser) => {
    setEditingUserId(user.id)
    setUserForm(toUserFormState(user))
    setErrorMessage(null)
  }

  const handleDeleteGame = async (id: string) => {
    setSavingGame(true)

    try {
      const response = await authorizedFetch(`/api/admin/games/${id}`, {
        method: 'DELETE',
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la suppression du jeu.')
      }

      if (editingGameId === id) {
        resetGameForm()
      }

      await loadGames()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de la suppression du jeu.')
    } finally {
      setSavingGame(false)
    }
  }

  const handleDeleteUser = async (id: string) => {
    setSavingUser(true)

    try {
      const response = await authorizedFetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la suppression de l utilisateur.')
      }

      if (editingUserId === id) {
        resetUserForm()
      }

      await loadUsers()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de la suppression de l utilisateur.')
    } finally {
      setSavingUser(false)
    }
  }

  const handleUserAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file || !editingUserId) {
      return
    }

    setUploadingUserAvatar(true)

    try {
      const avatarUrl = await uploadAdminAvatar(editingUserId, file)
      setUserForm((current) => ({
        ...current,
        avatar_url: avatarUrl,
      }))
      await loadUsers()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur upload avatar admin.')
    } finally {
      setUploadingUserAvatar(false)
      event.target.value = ''
    }
  }

  const exportCsv = async (entity: 'games' | 'users') => {
    try {
      const response = await authorizedFetch(`/api/admin/export/${entity}`)

      if (!response.ok) {
        const payload = await response.json()
        throw new Error(payload.error || 'Erreur export CSV.')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${entity}-export.csv`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur export CSV.')
    }
  }

  const handleImportChange = (field: keyof ImportState, value: string) => {
    setImportState((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleImportV1 = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setImporting(true)
    setImportMessage(null)

    try {
      const response = await authorizedFetch('/api/admin/import/v1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(importState),
      })

      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.error || 'Erreur pendant l import v1.')
      }

      await loadGames()
      setImportMessage(
        `${payload.importedCount} jeux importes, ${payload.copiedImagesCount} images copiees.` +
          (payload.missingImages?.length
            ? ` Images manquantes: ${payload.missingImages.slice(0, 5).join(', ')}`
            : '')
      )
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur pendant l import v1.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <main className="space-y-8">
      <section className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black uppercase text-cyan-500 mb-2">Admin Chibasko Games</h1>
            <p className="text-zinc-400">
              Interface complete pour piloter les jeux, les profils joueurs et les exports.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void exportCsv('games')}
              className="border border-cyan-700 px-4 py-2 text-xs font-bold text-cyan-300"
            >
              EXPORT CSV JEUX
            </button>
            <button
              type="button"
              onClick={() => void exportCsv('users')}
              className="border border-cyan-700 px-4 py-2 text-xs font-bold text-cyan-300"
            >
              EXPORT CSV USERS
            </button>
          </div>
        </div>
        {errorMessage ? (
          <p className="text-sm text-red-400 mt-4">{errorMessage}</p>
        ) : null}
        {importMessage ? (
          <p className="text-sm text-cyan-300 mt-2">{importMessage}</p>
        ) : null}
      </section>

      <section className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="mb-6">
          <h2 className="text-lg font-black uppercase text-white">Import v1</h2>
          <p className="text-zinc-400 mt-2">
            Lit ton ancien `game-data.js`, copie les miniatures dans `public/games` et reinjecte les jeux dans la v2.
          </p>
        </div>

        <form onSubmit={handleImportV1} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={importState.dataFilePath}
            onChange={(e) => handleImportChange('dataFilePath', e.target.value)}
            placeholder="Chemin vers game-data.js"
            className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2"
          />
          <input
            value={importState.imagesDirectoryPath}
            onChange={(e) => handleImportChange('imagesDirectoryPath', e.target.value)}
            placeholder="Chemin vers le dossier images"
            className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2"
          />
          <button
            type="submit"
            disabled={importing}
            className="md:col-span-2 bg-cyan-600 py-3 font-black text-black disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {importing ? 'IMPORT EN COURS...' : 'IMPORTER LES JEUX V1'}
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-8">
        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black uppercase text-white">
              {editingGameId ? 'Modifier un jeu' : 'Ajouter un jeu'}
            </h2>
            {editingGameId ? (
              <button
                type="button"
                onClick={resetGameForm}
                className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300"
              >
                Annuler
              </button>
            ) : null}
          </div>

          <form onSubmit={handleGameSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={gameForm.title} onChange={(e) => handleGameChange('title', e.target.value)} placeholder="Titre" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            <input value={gameForm.slug} onChange={(e) => handleGameChange('slug', e.target.value)} placeholder="Slug" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            <input value={gameForm.game_url} onChange={(e) => handleGameChange('game_url', e.target.value)} placeholder="URL du jeu" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2" required />
            <input value={gameForm.thumbnail_url} onChange={(e) => handleGameChange('thumbnail_url', e.target.value)} placeholder="Miniature" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2" />
            <input value={gameForm.developer_name} onChange={(e) => handleGameChange('developer_name', e.target.value)} placeholder="Developpeur" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.release_date_text} onChange={(e) => handleGameChange('release_date_text', e.target.value)} placeholder="Date de sortie" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.mobile_compatible} onChange={(e) => handleGameChange('mobile_compatible', e.target.value)} placeholder="Compatibilite mobile" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.technology} onChange={(e) => handleGameChange('technology', e.target.value)} placeholder="Technologie" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.provider_name} onChange={(e) => handleGameChange('provider_name', e.target.value)} placeholder="Provider" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.source_page_url} onChange={(e) => handleGameChange('source_page_url', e.target.value)} placeholder="Source page URL" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <textarea value={gameForm.description} onChange={(e) => handleGameChange('description', e.target.value)} placeholder="Description" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2 min-h-36" />
            <label className="flex items-center gap-3 text-sm text-zinc-300 md:col-span-2">
              <input type="checkbox" checked={gameForm.is_published} onChange={(e) => handleGameChange('is_published', e.target.checked)} />
              Jeu publie sur le site
            </label>
            <button type="submit" disabled={savingGame} className="md:col-span-2 bg-cyan-600 py-3 font-black text-black disabled:opacity-60 disabled:cursor-not-allowed">
              {savingGame ? 'SAUVEGARDE...' : editingGameId ? 'METTRE A JOUR LE JEU' : 'AJOUTER LE JEU'}
            </button>
          </form>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black uppercase text-white">Catalogue admin</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{games.length} jeux</span>
          </div>

          {loadingGames ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-20 bg-zinc-900 border border-zinc-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 max-h-[900px] overflow-y-auto pr-1">
              {games.map((game) => (
                <article key={game.id} className="border border-zinc-800 bg-black/30 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-white">{game.title}</p>
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 mt-1">{game.slug}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-[0.3em] ${game.is_published ? 'text-cyan-400' : 'text-zinc-500'}`}>
                      {game.is_published ? 'Publie' : 'Brouillon'}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 space-y-1">
                    <p>{game.developer_name || 'Developpeur non renseigne'}</p>
                    <p>{game.technology || 'Technologie non renseignee'}</p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => startEditGame(game)} className="flex-1 border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-300">
                      Editer
                    </button>
                    <button type="button" onClick={() => void handleDeleteGame(game.id)} className="flex-1 border border-red-900 px-3 py-2 text-xs font-bold text-red-400">
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-8">
        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black uppercase text-white">
              {editingUserId ? 'Modifier un joueur' : 'Selectionne un joueur'}
            </h2>
            {editingUserId ? (
              <button
                type="button"
                onClick={resetUserForm}
                className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300"
              >
                Annuler
              </button>
            ) : null}
          </div>

          <form onSubmit={handleUserSubmit} className="grid grid-cols-1 gap-4">
            <input value={userForm.username} onChange={(e) => handleUserChange('username', e.target.value)} placeholder="Pseudo" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            <input value={userForm.avatar_url} onChange={(e) => handleUserChange('avatar_url', e.target.value)} placeholder="Avatar public URL" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <label className="flex min-h-[56px] cursor-pointer items-center justify-between border border-zinc-800 bg-black px-3 text-sm text-zinc-300">
              <span>{uploadingUserAvatar ? 'Upload avatar...' : 'Importer une image avatar'}</span>
              <input type="file" accept="image/*,.ico" className="hidden" onChange={handleUserAvatarUpload} disabled={!editingUserId || uploadingUserAvatar} />
              <span className="border border-cyan-700 px-3 py-1 text-xs font-bold text-cyan-300">Choisir</span>
            </label>
            <input value={userForm.xp_points} onChange={(e) => handleUserChange('xp_points', Number(e.target.value) || 0)} placeholder="XP" type="number" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <textarea value={userForm.bio} onChange={(e) => handleUserChange('bio', e.target.value)} placeholder="Bio" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 min-h-32" />
            <button type="submit" disabled={savingUser || !editingUserId || uploadingUserAvatar} className="bg-cyan-600 py-3 font-black text-black disabled:opacity-60 disabled:cursor-not-allowed">
              {savingUser ? 'MISE A JOUR...' : 'METTRE A JOUR LE JOUEUR'}
            </button>
          </form>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center justify-between gap-4 mb-6">
            <h2 className="text-lg font-black uppercase text-white">Utilisateurs</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{users.length} comptes</span>
          </div>

          {loadingUsers ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-24 bg-zinc-900 border border-zinc-800 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-3 max-h-[900px] overflow-y-auto pr-1">
              {users.map((user) => (
                <article key={user.id} className="border border-zinc-800 bg-black/30 p-4 space-y-3">
                  <div>
                    <p className="font-bold text-white">{user.username}</p>
                    <p className="text-xs text-zinc-500 mt-1">{user.email || 'Email non disponible'}</p>
                  </div>
                  <div className="text-xs text-zinc-400 space-y-1">
                    <p>Pseudo: {user.username}</p>
                    <p>XP: {user.xp_points}</p>
                    <p>Bio: {user.bio || 'Aucune bio'}</p>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => startEditUser(user)} className="flex-1 border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-300">
                      Gerer
                    </button>
                    <button type="button" onClick={() => void handleDeleteUser(user.id)} className="flex-1 border border-red-900 px-3 py-2 text-xs font-bold text-red-400">
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

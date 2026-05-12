"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react'
import { uploadAdminAvatar, uploadAdminGameThumbnail } from '@/lib/avatarUpload'
import { supabase } from '@/lib/supabaseClient'
import { Tables } from '@/types/database'

type Game = Tables<'games'> & {
  game_categories?: { category_id: string }[]
}
type AdminUser = Tables<'profiles'> & { email: string | null }
type Category = Tables<'categories'> & { games_count?: number; game_categories?: { game_id: string }[] }
type FaqEntry = Tables<'faq_entries'>
type GameSubmission = Tables<'game_submissions'>

const submissionStatusLabels: Record<string, string> = {
  pending: 'En attente',
  reviewing: 'En cours de revue',
  accepted: 'Acceptee',
  rejected: 'Refusee',
  archived: 'Archivee',
}

const submissionActionHelp: Record<string, string> = {
  pending: 'Laisser la demande en file d attente sans action immediate.',
  reviewing: 'Marquer la proposition comme en cours d analyse.',
  accepted: 'Valider la proposition pour une integration manuelle ulterieure.',
  rejected: 'Refuser la proposition si elle ne convient pas au catalogue.',
  archived: 'Ranger la demande hors du flux principal sans la supprimer.',
}

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
  category_ids: string[]
}

type UserFormState = {
  username: string
  avatar_url: string
  bio: string
  xp_points: number
}

type CategoryFormState = {
  name: string
  slug: string
}

type FaqFormState = {
  question: string
  answer: string
  sort_order: number
  is_published: boolean
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
  category_ids: [],
}

const emptyUserForm: UserFormState = {
  username: '',
  avatar_url: '',
  bio: '',
  xp_points: 0,
}

const emptyCategoryForm: CategoryFormState = {
  name: '',
  slug: '',
}

const emptyFaqForm: FaqFormState = {
  question: '',
  answer: '',
  sort_order: 0,
  is_published: true,
}

function slugifyCategory(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
    category_ids: (game.game_categories ?? []).map((entry) => entry.category_id),
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

function toCategoryFormState(category: Category): CategoryFormState {
  return {
    name: category.name,
    slug: category.slug,
  }
}

function toFaqFormState(entry: FaqEntry): FaqFormState {
  return {
    question: entry.question,
    answer: entry.answer,
    sort_order: entry.sort_order,
    is_published: entry.is_published,
  }
}

export default function AdminPage() {
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>([])
  const [submissions, setSubmissions] = useState<GameSubmission[]>([])
  const [submissionNotes, setSubmissionNotes] = useState<Record<string, string>>({})
  const [gameForm, setGameForm] = useState<GameFormState>(emptyGameForm)
  const [userForm, setUserForm] = useState<UserFormState>(emptyUserForm)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm)
  const [faqForm, setFaqForm] = useState<FaqFormState>(emptyFaqForm)
  const [editingGameId, setEditingGameId] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [editingFaqId, setEditingFaqId] = useState<string | null>(null)
  const [loadingGames, setLoadingGames] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingFaq, setLoadingFaq] = useState(true)
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [savingGame, setSavingGame] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [savingFaq, setSavingFaq] = useState(false)
  const [savingSubmissionId, setSavingSubmissionId] = useState<string | null>(null)
  const [uploadingGameThumbnail, setUploadingGameThumbnail] = useState(false)
  const [uploadingUserAvatar, setUploadingUserAvatar] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true)
    try {
      const response = await authorizedFetch('/api/admin/categories')
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Acces admin refuse.')
      }
      setCategories(payload.categories || [])
      setErrorMessage(null)
    } catch (error) {
      setCategories([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur categories.')
    } finally {
      setLoadingCategories(false)
    }
  }, [authorizedFetch])

  const loadFaq = useCallback(async () => {
    setLoadingFaq(true)
    try {
      const response = await authorizedFetch('/api/admin/faq')
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Acces FAQ refuse.')
      }
      setFaqEntries(payload.faqEntries || [])
      setErrorMessage(null)
    } catch (error) {
      setFaqEntries([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur FAQ.')
    } finally {
      setLoadingFaq(false)
    }
  }, [authorizedFetch])

  const loadSubmissions = useCallback(async () => {
    setLoadingSubmissions(true)
    try {
      const response = await authorizedFetch('/api/admin/game-submissions')
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Acces propositions refuse.')
      }
      const nextSubmissions = payload.submissions || []
      setSubmissions(nextSubmissions)
      setSubmissionNotes(
        Object.fromEntries(
          nextSubmissions.map((submission: GameSubmission) => [submission.id, submission.admin_notes || ''])
        )
      )
      setErrorMessage(null)
    } catch (error) {
      setSubmissions([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur propositions developpeurs.')
    } finally {
      setLoadingSubmissions(false)
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
        setLoadingCategories(false)
        setLoadingFaq(false)
        setLoadingSubmissions(false)
        setErrorMessage('Connecte-toi avec un compte admin pour acceder a cet espace.')
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
      await Promise.all([loadGames(), loadUsers(), loadCategories(), loadFaq(), loadSubmissions()])
    }

    void refreshAdminPanels()
  }, [sessionToken, loadGames, loadUsers, loadCategories, loadFaq, loadSubmissions])

  const handleGameChange = (field: keyof GameFormState, value: string | boolean | string[]) => {
    setGameForm((current) => ({ ...current, [field]: value }))
  }

  const handleUserChange = (field: keyof UserFormState, value: string | number) => {
    setUserForm((current) => ({ ...current, [field]: value }))
  }

  const handleCategoryToggle = (categoryId: string) => {
    setGameForm((current) => ({
      ...current,
      category_ids: current.category_ids.includes(categoryId)
        ? current.category_ids.filter((id) => id !== categoryId)
        : [...current.category_ids, categoryId],
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

  const resetCategoryForm = () => {
    setCategoryForm(emptyCategoryForm)
    setEditingCategoryId(null)
  }

  const resetFaqForm = () => {
    setFaqForm(emptyFaqForm)
    setEditingFaqId(null)
  }

  const handleGameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingGame(true)
    try {
      const endpoint = editingGameId ? `/api/admin/games/${editingGameId}` : '/api/admin/games'
      const method = editingGameId ? 'PATCH' : 'POST'
      const response = await authorizedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameForm),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la sauvegarde du jeu.')
      }
      resetGameForm()
      await Promise.all([loadGames(), loadCategories()])
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
        headers: { 'Content-Type': 'application/json' },
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

  const handleCategorySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingCategory(true)
    try {
      const endpoint = editingCategoryId ? `/api/admin/categories/${editingCategoryId}` : '/api/admin/categories'
      const method = editingCategoryId ? 'PATCH' : 'POST'
      const response = await authorizedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: categoryForm.name,
          slug: categoryForm.slug || slugifyCategory(categoryForm.name),
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur categorie.')
      }
      resetCategoryForm()
      await loadCategories()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur categorie.')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleFaqSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingFaq(true)
    try {
      const endpoint = editingFaqId ? `/api/admin/faq/${editingFaqId}` : '/api/admin/faq'
      const method = editingFaqId ? 'PATCH' : 'POST'
      const response = await authorizedFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(faqForm),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur FAQ.')
      }
      resetFaqForm()
      await loadFaq()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur FAQ.')
    } finally {
      setSavingFaq(false)
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

  const startEditCategory = (category: Category) => {
    setEditingCategoryId(category.id)
    setCategoryForm(toCategoryFormState(category))
    setErrorMessage(null)
  }

  const startEditFaq = (entry: FaqEntry) => {
    setEditingFaqId(entry.id)
    setFaqForm(toFaqFormState(entry))
    setErrorMessage(null)
  }

  const confirmDeletion = (label: string) => {
    return window.confirm(`Confirmer la suppression de ${label} ?\n\nCette action est irreversible.`)
  }

  const handleDeleteGame = async (id: string) => {
    if (!confirmDeletion('ce jeu')) {
      return
    }

    setSavingGame(true)
    try {
      const response = await authorizedFetch(`/api/admin/games/${id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la suppression du jeu.')
      }
      if (editingGameId === id) {
        resetGameForm()
      }
      await Promise.all([loadGames(), loadCategories()])
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de la suppression du jeu.')
    } finally {
      setSavingGame(false)
    }
  }

  const handleDeleteUser = async (id: string) => {
    if (!confirmDeletion('cet utilisateur')) {
      return
    }

    setSavingUser(true)
    try {
      const response = await authorizedFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
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

  const handleDeleteCategory = async (id: string) => {
    if (!confirmDeletion('cette categorie')) {
      return
    }

    setSavingCategory(true)
    try {
      const response = await authorizedFetch(`/api/admin/categories/${id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la suppression de la categorie.')
      }
      if (editingCategoryId === id) {
        resetCategoryForm()
      }
      setGameForm((current) => ({
        ...current,
        category_ids: current.category_ids.filter((categoryId) => categoryId !== id),
      }))
      await Promise.all([loadCategories(), loadGames()])
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de la suppression de la categorie.')
    } finally {
      setSavingCategory(false)
    }
  }

  const handleDeleteFaq = async (id: string) => {
    if (!confirmDeletion('cette entree FAQ')) {
      return
    }

    setSavingFaq(true)
    try {
      const response = await authorizedFetch(`/api/admin/faq/${id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur suppression FAQ.')
      }
      if (editingFaqId === id) {
        resetFaqForm()
      }
      await loadFaq()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur suppression FAQ.')
    } finally {
      setSavingFaq(false)
    }
  }

  const handleSubmissionStatus = async (id: string, status: GameSubmission['status']) => {
    setSavingSubmissionId(id)
    try {
      const response = await authorizedFetch(`/api/admin/game-submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_notes: submissionNotes[id] || '' }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur mise a jour proposition.')
      }
      await loadSubmissions()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur mise a jour proposition.')
    } finally {
      setSavingSubmissionId(null)
    }
  }

  const handleSubmissionNotesSave = async (id: string, currentStatus: GameSubmission['status']) => {
    setSavingSubmissionId(id)
    try {
      const response = await authorizedFetch(`/api/admin/game-submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: currentStatus, admin_notes: submissionNotes[id] || '' }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur sauvegarde notes admin.')
      }
      await loadSubmissions()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur sauvegarde notes admin.')
    } finally {
      setSavingSubmissionId(null)
    }
  }

  const handleCopySubmissionLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setErrorMessage(null)
    } catch {
      setErrorMessage('Impossible de copier le lien automatiquement.')
    }
  }

  const handleOpenExternalLink = (url: string) => {
    const confirmed = window.confirm(
      `Tu vas ouvrir un lien externe soumis par un developpeur.\n\n${url}\n\nVerifie toujours la source avant de poursuivre.`
    )

    if (!confirmed) {
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleDeleteSubmission = async (id: string) => {
    if (!confirmDeletion('cette proposition developpeur')) {
      return
    }

    setSavingSubmissionId(id)
    try {
      const response = await authorizedFetch(`/api/admin/game-submissions/${id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur suppression proposition.')
      }
      await loadSubmissions()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur suppression proposition.')
    } finally {
      setSavingSubmissionId(null)
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

  const handleGameThumbnailUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setUploadingGameThumbnail(true)

    try {
      const thumbnailUrl = await uploadAdminGameThumbnail(file, gameForm.slug || gameForm.title)
      setGameForm((current) => ({
        ...current,
        thumbnail_url: thumbnailUrl,
      }))
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur upload miniature jeu.')
    } finally {
      setUploadingGameThumbnail(false)
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

  return (
    <main className="space-y-8">
      <section className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="mb-2 text-2xl font-black uppercase text-cyan-500">Admin Chibasko Games</h1>
            <p className="text-zinc-400">
              Gere le catalogue, les categories, la FAQ et les profils joueurs.
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
        {errorMessage ? <p className="mt-4 text-sm text-red-400">{errorMessage}</p> : null}
      </section>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black uppercase text-white">
              {editingGameId ? 'Modifier un jeu' : 'Ajouter un jeu'}
            </h2>
            {editingGameId ? (
              <button type="button" onClick={resetGameForm} className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300">
                Annuler
              </button>
            ) : null}
          </div>

          <form onSubmit={handleGameSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input value={gameForm.title} onChange={(e) => handleGameChange('title', e.target.value)} placeholder="Titre" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            <input value={gameForm.slug} onChange={(e) => handleGameChange('slug', e.target.value)} placeholder="Slug" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            <input value={gameForm.game_url} onChange={(e) => handleGameChange('game_url', e.target.value)} placeholder="URL du jeu" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2" required />
            <input value={gameForm.thumbnail_url} onChange={(e) => handleGameChange('thumbnail_url', e.target.value)} placeholder="Miniature" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2" />
            <label className="flex min-h-[56px] cursor-pointer items-center justify-between border border-zinc-800 bg-black px-3 text-sm text-zinc-300 md:col-span-2">
              <span>{uploadingGameThumbnail ? 'Upload miniature...' : 'Importer une image de jeu'}</span>
              <input type="file" accept="image/*,.ico" className="hidden" onChange={handleGameThumbnailUpload} disabled={uploadingGameThumbnail} />
              <span className="border border-cyan-700 px-3 py-1 text-xs font-bold text-cyan-300">Choisir</span>
            </label>
            <input value={gameForm.developer_name} onChange={(e) => handleGameChange('developer_name', e.target.value)} placeholder="Developpeur" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.release_date_text} onChange={(e) => handleGameChange('release_date_text', e.target.value)} placeholder="Date de sortie" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.mobile_compatible} onChange={(e) => handleGameChange('mobile_compatible', e.target.value)} placeholder="Compatibilite mobile" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.technology} onChange={(e) => handleGameChange('technology', e.target.value)} placeholder="Technologie" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.provider_name} onChange={(e) => handleGameChange('provider_name', e.target.value)} placeholder="Provider" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <input value={gameForm.source_page_url} onChange={(e) => handleGameChange('source_page_url', e.target.value)} placeholder="Source page URL" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <textarea value={gameForm.description} onChange={(e) => handleGameChange('description', e.target.value)} placeholder="Description" className="min-h-36 bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500 md:col-span-2" />

            <div className="border border-zinc-800 bg-black/40 p-4 md:col-span-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-300">Categories du jeu</p>
                <span className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">
                  {gameForm.category_ids.length} selection
                </span>
              </div>
              {loadingCategories ? (
                <p className="text-sm text-zinc-500">Chargement des categories...</p>
              ) : categories.length === 0 ? (
                <p className="text-sm text-zinc-500">Ajoute d abord une categorie plus bas.</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {categories.map((category) => (
                    <label key={category.id} className="flex items-center gap-3 border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
                      <input type="checkbox" checked={gameForm.category_ids.includes(category.id)} onChange={() => handleCategoryToggle(category.id)} />
                      <span>{category.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-3 text-sm text-zinc-300 md:col-span-2">
              <input type="checkbox" checked={gameForm.is_published} onChange={(e) => handleGameChange('is_published', e.target.checked)} />
              Jeu publie sur le site
            </label>
            <button type="submit" disabled={savingGame} className="bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2">
              {savingGame ? 'SAUVEGARDE...' : editingGameId ? 'METTRE A JOUR LE JEU' : 'AJOUTER LE JEU'}
            </button>
          </form>
        </div>

        <div className="space-y-8">
          <div className="border border-zinc-800 bg-zinc-950 p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-lg font-black uppercase text-white">Catalogue admin</h2>
              <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{games.length} jeux</span>
            </div>

            {loadingGames ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="h-20 animate-pulse border border-zinc-800 bg-zinc-900" />
                ))}
              </div>
            ) : (
              <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                {games.map((game) => (
                  <article key={game.id} className="space-y-3 border border-zinc-800 bg-black/30 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">{game.title}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">{game.slug}</p>
                      </div>
                      <span className={`text-[10px] uppercase tracking-[0.3em] ${game.is_published ? 'text-cyan-400' : 'text-zinc-500'}`}>
                        {game.is_published ? 'Publie' : 'Brouillon'}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-zinc-400">
                      <p>{game.developer_name || 'Developpeur non renseigne'}</p>
                      <p>{game.technology || 'Technologie non renseignee'}</p>
                      <p>Categories: {(game.game_categories ?? []).length > 0 ? `${(game.game_categories ?? []).length} liees` : 'Aucune'}</p>
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

          <div className="border border-zinc-800 bg-zinc-950 p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-lg font-black uppercase text-white">
                {editingCategoryId ? 'Modifier une categorie' : 'Ajouter une categorie'}
              </h2>
              {editingCategoryId ? (
                <button type="button" onClick={resetCategoryForm} className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300">
                  Annuler
                </button>
              ) : null}
            </div>

            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <input
                value={categoryForm.name}
                onChange={(event) => {
                  const nextName = event.target.value
                  setCategoryForm((current) => ({
                    ...current,
                    name: nextName,
                    slug: current.slug ? current.slug : slugifyCategory(nextName),
                  }))
                }}
                placeholder="Nom de categorie"
                className="w-full bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500"
                required
              />
              <input
                value={categoryForm.slug}
                onChange={(event) => setCategoryForm((current) => ({ ...current, slug: slugifyCategory(event.target.value) }))}
                placeholder="Slug categorie"
                className="w-full bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500"
                required
              />
              <button type="submit" disabled={savingCategory} className="w-full bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60">
                {savingCategory ? 'SAUVEGARDE...' : editingCategoryId ? 'METTRE A JOUR LA CATEGORIE' : 'AJOUTER LA CATEGORIE'}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {loadingCategories ? (
                Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse border border-zinc-800 bg-zinc-900" />
                ))
              ) : categories.length === 0 ? (
                <p className="text-sm text-zinc-500">Aucune categorie pour le moment.</p>
              ) : (
                categories.map((category) => (
                  <article key={category.id} className="border border-zinc-800 bg-black/30 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">{category.name}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">{category.slug}</p>
                        <p className="mt-2 text-xs text-zinc-400">{category.games_count ?? 0} jeux rattaches</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEditCategory(category)} className="border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-300">
                          Editer
                        </button>
                        <button type="button" onClick={() => void handleDeleteCategory(category.id)} className="border border-red-900 px-3 py-2 text-xs font-bold text-red-400">
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black uppercase text-white">
              {editingUserId ? 'Modifier un joueur' : 'Selectionne un joueur'}
            </h2>
            {editingUserId ? (
              <button type="button" onClick={resetUserForm} className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300">
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
            <textarea value={userForm.bio} onChange={(e) => handleUserChange('bio', e.target.value)} placeholder="Bio" className="min-h-32 bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <button type="submit" disabled={savingUser || !editingUserId || uploadingUserAvatar} className="bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60">
              {savingUser ? 'MISE A JOUR...' : 'METTRE A JOUR LE JOUEUR'}
            </button>
          </form>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black uppercase text-white">Utilisateurs</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{users.length} comptes</span>
          </div>

          {loadingUsers ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse border border-zinc-800 bg-zinc-900" />
              ))}
            </div>
          ) : (
            <div className="max-h-[900px] space-y-3 overflow-y-auto pr-1">
              {users.map((user) => (
                <article key={user.id} className="space-y-3 border border-zinc-800 bg-black/30 p-4">
                  <div>
                    <p className="font-bold text-white">{user.username}</p>
                    <p className="mt-1 text-xs text-zinc-500">{user.email || 'Email non disponible'}</p>
                  </div>
                  <div className="space-y-1 text-xs text-zinc-400">
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

      <section className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black uppercase text-white">Propositions developpeurs</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Demandes recues depuis la page publique Publier un jeu. Tu peux les examiner, noter leur statut, sauvegarder tes notes puis integrer manuellement les jeux retenus dans ton formulaire catalogue.
            </p>
          </div>
          <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{submissions.length} demandes</span>
        </div>

        {loadingSubmissions ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 animate-pulse border border-zinc-800 bg-zinc-900" />
            ))}
          </div>
        ) : submissions.length === 0 ? (
          <p className="text-sm text-zinc-500">Aucune proposition developpeur pour le moment.</p>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <article key={submission.id} className="space-y-5 rounded-[28px] border border-zinc-800 bg-[linear-gradient(180deg,rgba(20,24,33,0.82),rgba(9,9,11,0.94))] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-lg font-black text-white">{submission.game_title}</p>
                    <p className="mt-1 text-sm text-zinc-400">{submission.name_or_studio} • {submission.email}</p>
                    <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
                      {submission.short_description || submission.description}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-2 text-[10px] uppercase tracking-[0.3em] ${
                    submission.status === 'accepted'
                      ? 'border-cyan-900 text-cyan-400'
                      : submission.status === 'rejected'
                        ? 'border-red-950 text-red-400'
                        : submission.status === 'reviewing'
                          ? 'border-amber-900 text-amber-300'
                          : submission.status === 'archived'
                            ? 'border-zinc-800 text-zinc-500'
                            : 'border-zinc-800 text-zinc-400'
                  }`}>
                    {submissionStatusLabels[submission.status] || submission.status}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Type de jeu</p>
                    <p className="mt-2 text-sm text-white">{submission.game_type}</p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Compatibilite mobile</p>
                    <p className="mt-2 text-sm text-white">{submission.mobile_compatibility || 'Non renseignee'}</p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Contenu sensible</p>
                    <p className="mt-2 text-sm text-white">{submission.sensitive_content || 'Non renseigne'}</p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Pubs</p>
                    <p className="mt-2 text-sm text-white">
                      {submission.has_ads === true ? 'Oui' : submission.has_ads === false ? 'Non' : 'Non renseigne'}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Date</p>
                    <p className="mt-2 text-sm text-white">{new Date(submission.created_at).toLocaleString('fr-FR')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Lien de demo complet</p>
                    <p className="mt-3 break-all text-sm leading-6 text-cyan-300">{submission.demo_url}</p>
                    <p className="mt-3 text-xs leading-5 text-zinc-500">
                      Attention : lien externe soumis par un developpeur. Verifie toujours la source avant ouverture.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleCopySubmissionLink(submission.demo_url)}
                        className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200"
                      >
                        Copier le lien
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenExternalLink(submission.demo_url)}
                        className="border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-300"
                      >
                        Ouvrir dans un nouvel onglet
                      </button>
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Site / portfolio</p>
                    <p className="mt-3 break-all text-sm leading-6 text-zinc-300">
                      {submission.developer_website || 'Non renseigne'}
                    </p>
                    {submission.developer_website ? (
                      <button
                        type="button"
                        onClick={() => handleOpenExternalLink(submission.developer_website!)}
                        className="mt-4 border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-300"
                      >
                        Ouvrir le site
                      </button>
                    ) : null}
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Categories proposees</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {submission.category_names.length > 0 ? submission.category_names.map((categoryName) => (
                        <span key={categoryName} className="border border-cyan-900 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-cyan-300">
                          {categoryName}
                        </span>
                      )) : <span className="text-sm text-zinc-500">Aucune categorie</span>}
                    </div>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Publication ailleurs</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">{submission.published_elsewhere || 'Non renseignee'}</p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Confirmation de droits</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">
                      {submission.ownership_confirmed ? 'Le developpeur affirme etre proprietaire ou autorise a proposer ce jeu.' : 'Confirmation absente.'}
                    </p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Description longue</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300 whitespace-pre-line">{submission.long_description || submission.description}</p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Attentes / conditions</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300 whitespace-pre-line">{submission.expectations || 'Aucune condition precise.'}</p>
                  </div>
                  <div className="rounded-[22px] border border-zinc-800 bg-zinc-950 p-4 xl:col-span-2">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Message</p>
                    <p className="mt-3 text-sm leading-6 text-zinc-300 whitespace-pre-line">{submission.message || 'Aucun message complementaire.'}</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-cyan-950/60 bg-cyan-950/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Notes admin</p>
                  <textarea
                    value={submissionNotes[submission.id] || ''}
                    onChange={(event) =>
                      setSubmissionNotes((current) => ({
                        ...current,
                        [submission.id]: event.target.value,
                      }))
                    }
                    placeholder="Observations, points a verifier, decision interne..."
                    className="mt-3 min-h-28 w-full rounded-2xl border border-zinc-800 bg-black/50 p-4 text-white outline-none focus:border-cyan-500"
                  />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleSubmissionNotesSave(submission.id, submission.status)}
                      disabled={savingSubmissionId === submission.id}
                      className="border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-300 disabled:opacity-60"
                    >
                      Sauvegarder les notes
                    </button>
                    <span className="text-xs leading-5 text-zinc-500">
                      Ces notes servent a documenter ton analyse avant la decision finale.
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  {(['pending', 'reviewing', 'accepted', 'rejected', 'archived'] as const).map((statusKey) => (
                    <button
                      key={statusKey}
                      type="button"
                      onClick={() => void handleSubmissionStatus(submission.id, statusKey)}
                      disabled={savingSubmissionId === submission.id}
                      className={`rounded-[20px] border px-4 py-4 text-left disabled:opacity-60 ${
                        submission.status === statusKey
                          ? 'border-cyan-700 bg-cyan-950/20'
                          : 'border-zinc-800 bg-black/25'
                      }`}
                    >
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-white">
                        {submissionStatusLabels[statusKey]}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">
                        {submissionActionHelp[statusKey]}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleDeleteSubmission(submission.id)}
                    disabled={savingSubmissionId === submission.id}
                    className="border border-red-950 px-3 py-2 text-xs font-bold text-red-500 disabled:opacity-60"
                  >
                    Supprimer definitivement
                  </button>
                  <span className="text-xs leading-5 text-zinc-500">
                    Suppression reservee aux doublons ou demandes inutilisables.
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black uppercase text-white">
              {editingFaqId ? 'Modifier une entree FAQ' : 'Ajouter une entree FAQ'}
            </h2>
            {editingFaqId ? (
              <button type="button" onClick={resetFaqForm} className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300">
                Annuler
              </button>
            ) : null}
          </div>

          <form onSubmit={handleFaqSubmit} className="grid grid-cols-1 gap-4">
            <input value={faqForm.question} onChange={(event) => setFaqForm((current) => ({ ...current, question: event.target.value }))} placeholder="Question" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            <textarea value={faqForm.answer} onChange={(event) => setFaqForm((current) => ({ ...current, answer: event.target.value }))} placeholder="Reponse" className="min-h-40 bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            <input value={faqForm.sort_order} onChange={(event) => setFaqForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))} placeholder="Ordre d affichage" type="number" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            <label className="flex items-center gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={faqForm.is_published} onChange={(event) => setFaqForm((current) => ({ ...current, is_published: event.target.checked }))} />
              Entree publiee sur la page FAQ
            </label>
            <button type="submit" disabled={savingFaq} className="bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60">
              {savingFaq ? 'SAUVEGARDE...' : editingFaqId ? 'METTRE A JOUR LA FAQ' : 'AJOUTER LA FAQ'}
            </button>
          </form>
        </div>

        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-lg font-black uppercase text-white">FAQ publique</h2>
            <span className="text-xs uppercase tracking-[0.3em] text-zinc-500">{faqEntries.length} entrees</span>
          </div>

          {loadingFaq ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-24 animate-pulse border border-zinc-800 bg-zinc-900" />
              ))}
            </div>
          ) : faqEntries.length === 0 ? (
            <p className="text-sm text-zinc-500">Aucune entree FAQ pour le moment.</p>
          ) : (
            <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
              {faqEntries.map((entry) => (
                <article key={entry.id} className="space-y-3 border border-zinc-800 bg-black/30 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-white">{entry.question}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">Ordre {entry.sort_order}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-[0.3em] ${entry.is_published ? 'text-cyan-400' : 'text-zinc-500'}`}>
                      {entry.is_published ? 'Publiee' : 'Masquee'}
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-zinc-400">{entry.answer}</p>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => startEditFaq(entry)} className="flex-1 border border-cyan-800 px-3 py-2 text-xs font-bold text-cyan-300">
                      Editer
                    </button>
                    <button type="button" onClick={() => void handleDeleteFaq(entry.id)} className="flex-1 border border-red-900 px-3 py-2 text-xs font-bold text-red-400">
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

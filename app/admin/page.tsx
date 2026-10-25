"use client";
import { changeGameFormType, gameFormPayload, type GameType } from '@/lib/multiplayer/catalogue'
import FormField from '@/components/ui/FormField'
import AdminShell, { type AdminSection } from '@/components/admin/AdminShell'
import AdminOverview from '@/components/admin/AdminOverview'
import AdminEditor from '@/components/admin/AdminEditor'
import AdminUserTable from '@/components/admin/AdminUserTable'
import AdminGameTable from '@/components/admin/AdminGameTable'
import AdminPagination from '@/components/admin/AdminPagination'
import type { ProfileRoles } from '@/lib/profileRoles'

import GameTypeFields from '@/components/admin/GameTypeFields'
import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { useAdminAccess } from '@/components/admin/useAdminAccess'
import { uploadAdminAvatar, uploadAdminGameThumbnail } from '@/lib/avatarUpload'
import { Tables } from '@/types/database'

type Game = Tables<'games'> & {
  game_categories?: { category_id: string }[]
}
type AdminUser = Tables<'profiles'> & { email: string | null; roles?: ProfileRoles }
type Category = Tables<'categories'> & { games_count?: number; game_categories?: { game_id: string }[] }
type FaqEntry = Tables<'faq_entries'>
type GameFormState = {
  game_type: GameType
  multiplayer_game_id: string
  is_beta: boolean
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
  game_type: 'classic',
  multiplayer_game_id: '',
  is_beta: false,
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
    game_type: game.game_type ?? 'classic',
    multiplayer_game_id: game.multiplayer_game_id ?? '',
    is_beta: game.is_beta ?? false,
    game_url: game.game_url ?? '',
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
  const { user } = useAuth()
  // An account change remounts the panel: drafts/private lists cannot cross users.
  return <AdminPanel key={user?.id ?? 'anonymous'} />
}

function AdminPanel() {
  const { session } = useAuth()
  const sessionToken = session?.access_token ?? null
  const { status: accessStatus, checking, retry } = useAdminAccess()
  const router = useRouter()
  const query = useSearchParams(), requestedSection = query.get('section')
  const section: AdminSection = ['games', 'users', 'categories', 'faq'].includes(requestedSection ?? '') ? requestedSection as AdminSection : 'overview'
  const requestedGameStatus=query.get('status')
  const routeGameStatus=requestedGameStatus==='published'||requestedGameStatus==='hidden'?requestedGameStatus:'all'
  const [gameEditorOpen, setGameEditorOpen] = useState(false)
  const [categoryEditorOpen,setCategoryEditorOpen]=useState(false),[faqEditorOpen,setFaqEditorOpen]=useState(false)
  const [gameSearchDraft, setGameSearchDraft] = useState(''), [gameSearch, setGameSearch] = useState('')
  const [gameStatus, setGameStatus] = useState<string>(routeGameStatus), [gameTypeFilter, setGameTypeFilter] = useState('all')
  const [userSearchDraft, setUserSearchDraft] = useState(''), [userSearch, setUserSearch] = useState(''), [userRoleFilter, setUserRoleFilter] = useState('all')
  const [games, setGames] = useState<Game[]>([])
  const [gamesPage, setGamesPage] = useState(1), [gamesTotal, setGamesTotal] = useState(0)
  const [usersPage, setUsersPage] = useState(1), [usersTotal, setUsersTotal] = useState(0)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [faqEntries, setFaqEntries] = useState<FaqEntry[]>([])
  const [gameForm, setGameForm] = useState<GameFormState>(emptyGameForm)
  const userMutationLocked = useRef(false)
  const userRead = useRef(0)
  const gameRead = useRef(0)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [expectedUser, setExpectedUser] = useState<{ username: string; bio: string | null; avatar_url: string | null } | null>(null)
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
  const [savingGame, setSavingGame] = useState(false)
  const [savingUser, setSavingUser] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const [savingFaq, setSavingFaq] = useState(false)
  const [uploadingGameThumbnail, setUploadingGameThumbnail] = useState(false)
  const [uploadingUserAvatar, setUploadingUserAvatar] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletionNotice, setDeletionNotice] = useState<string | null>(null)
  const navigationKey=section+':'+routeGameStatus
  const [previousNavigation,setPreviousNavigation]=useState(navigationKey)
  // Les raccourcis de la vue d’ensemble peuvent imposer un filtre de visibilité.
  if(previousNavigation!==navigationKey){
    setPreviousNavigation(navigationKey)
    if(section==='games'){setGameStatus(routeGameStatus);setGamesPage(1)}
  }


  const authorizedFetch = useCallback(async (input: string, init?: RequestInit) => {
    if (!sessionToken) {
      throw new Error('Tu dois etre connecte avec un compte admin.')
    }

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${sessionToken}`)

    return fetch(input, {
      ...init,
      headers,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
    })
  }, [sessionToken])

  const loadGames = useCallback(async (signal?: AbortSignal) => {
    const attempt = ++gameRead.current
    setLoadingGames(true)
    try {
      const response = await authorizedFetch('/api/admin/games?' + new URLSearchParams({ page: String(gamesPage), search: gameSearch, status: gameStatus, type: gameTypeFilter }), { signal })
      const payload = await response.json()
      if (signal?.aborted || attempt !== gameRead.current) return
      if (!response.ok) {
        throw new Error(payload.error || 'Acces admin refuse.')
      }
      if(gamesPage>Math.max(1,Math.ceil(payload.total/50))){setGamesPage(Math.max(1,Math.ceil(payload.total/50)));return}
      setGames(payload.games || []); setGamesTotal(payload.total ?? payload.games?.length ?? 0)
      setErrorMessage(null)
    } catch (error) {
      if (signal?.aborted || attempt !== gameRead.current) return
      setGames([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur admin.')
    } finally {
      if (!signal?.aborted && attempt === gameRead.current) setLoadingGames(false)
    }
  }, [authorizedFetch, gamesPage, gameSearch, gameStatus, gameTypeFilter])

  const loadUsers = useCallback(async (signal?: AbortSignal) => {
    const attempt = ++userRead.current
    setLoadingUsers(true)
    try {
      const response = await authorizedFetch('/api/admin/users?' + new URLSearchParams({ page: String(usersPage), search: userSearch, role: userRoleFilter }), { signal })
      const payload = await response.json()
      if (signal?.aborted || attempt !== userRead.current) return
      if (!response.ok) {
        throw new Error(payload.error || 'Acces admin refuse.')
      }
      if(usersPage>Math.max(1,Math.ceil(payload.total/50))){setUsersPage(Math.max(1,Math.ceil(payload.total/50)));return}
      setUsers(payload.users || []); setUsersTotal(payload.total ?? payload.users?.length ?? 0)
      setUsersError(null)
    } catch {
      if (signal?.aborted || attempt !== userRead.current) return
      setUsers([])
      setUsersError('Impossible de charger les utilisateurs. Réessayez.')
    } finally {
      if (!signal?.aborted && attempt === userRead.current) setLoadingUsers(false)
    }
  }, [authorizedFetch, usersPage, userSearch, userRoleFilter])

  const loadCategories = useCallback(async (signal?: AbortSignal) => {
    setLoadingCategories(true)
    try {
      const response = await authorizedFetch('/api/admin/categories', { signal })
      const payload = await response.json()
      if (signal?.aborted) return
      if (!response.ok) {
        throw new Error(payload.error || 'Acces admin refuse.')
      }
      setCategories(payload.categories || [])
      setErrorMessage(null)
    } catch (error) {
      if (signal?.aborted) return
      setCategories([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur categories.')
    } finally {
      if (!signal?.aborted) setLoadingCategories(false)
    }
  }, [authorizedFetch])

  const loadFaq = useCallback(async (signal?: AbortSignal) => {
    setLoadingFaq(true)
    try {
      const response = await authorizedFetch('/api/admin/faq', { signal })
      const payload = await response.json()
      if (signal?.aborted) return
      if (!response.ok) {
        throw new Error(payload.error || 'Acces FAQ refuse.')
      }
      setFaqEntries(payload.faqEntries || [])
      setErrorMessage(null)
    } catch (error) {
      if (signal?.aborted) return
      setFaqEntries([])
      setErrorMessage(error instanceof Error ? error.message : 'Erreur FAQ.')
    } finally {
      if (!signal?.aborted) setLoadingFaq(false)
    }
  }, [authorizedFetch])

  useEffect(() => {
    if (accessStatus === 'unauthenticated') router.replace('/login?next=%2Fadmin')
  }, [accessStatus, router])

  useEffect(() => {
    if (accessStatus !== 'allowed' || !(section === 'games')) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadGames(controller.signal) })
    return () => controller.abort()
  }, [accessStatus, loadGames, section])

  useEffect(() => {
    if (accessStatus !== 'allowed' || !(section === 'users')) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadUsers(controller.signal) })
    return () => controller.abort()
  }, [accessStatus, loadUsers, section])

  useEffect(() => {
    if (accessStatus !== 'allowed' || !(section === 'games' || section === 'categories')) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadCategories(controller.signal) })
    return () => controller.abort()
  }, [accessStatus, loadCategories, section])

  useEffect(() => {
    if (accessStatus !== 'allowed' || !(section === 'faq')) return
    const controller = new AbortController()
    queueMicrotask(() => { if (!controller.signal.aborted) void loadFaq(controller.signal) })
    return () => controller.abort()
  }, [accessStatus, loadFaq, section])

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
    setGameEditorOpen(false)
  }

  const resetUserForm = () => {
    setExpectedUser(null)
    setUserForm(emptyUserForm)
    setEditingUserId(null)
  }

  const resetCategoryForm = () => {
    setCategoryForm(emptyCategoryForm)
    setEditingCategoryId(null)
    setCategoryEditorOpen(false)
  }

  const resetFaqForm = () => {
    setFaqForm(emptyFaqForm)
    setEditingFaqId(null)
    setFaqEditorOpen(false)
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
        body: JSON.stringify(gameFormPayload(gameForm)),
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
    if (userMutationLocked.current) return
    if (!editingUserId) {
      setErrorMessage('Selectionne un utilisateur a modifier.')
      return
    }
    userMutationLocked.current = true
    setSavingUser(true)
    try {
      const response = await authorizedFetch(`/api/admin/users/${editingUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...userForm, expected: expectedUser }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la mise a jour de l utilisateur.')
      }
      if (payload.user) { setExpectedUser({ username: payload.user.username, bio: payload.user.bio, avatar_url: payload.user.avatar_url }); setUserForm(toUserFormState(payload.user)) }
      await loadUsers()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur lors de la mise a jour de l utilisateur.')
    } finally {
      userMutationLocked.current = false
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
    setGameEditorOpen(true)
    setEditingGameId(game.id)
    setGameForm(toGameFormState(game))
    setErrorMessage(null)
  }

  const startEditUser = (user: AdminUser) => {
    if (userMutationLocked.current) return
    setExpectedUser({ username: user.username, bio: user.bio, avatar_url: user.avatar_url })
    setEditingUserId(user.id)
    setUserForm(toUserFormState(user))
    setErrorMessage(null)
  }

  const startEditCategory = (category: Category) => {
    setCategoryEditorOpen(true)
    setEditingCategoryId(category.id)
    setCategoryForm(toCategoryFormState(category))
    setErrorMessage(null)
  }

  const startEditFaq = (entry: FaqEntry) => {
    setFaqEditorOpen(true)
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
    if (userMutationLocked.current) return
    if (id === session?.user.id) { setErrorMessage('Utilisez le tableau de bord pour votre propre compte.'); return }
    if (window.prompt('Pour demander la suppression de ' + (users.find(user => user.id === id)?.username ?? id) + ', saisissez SUPPRIMER.') !== 'SUPPRIMER') {
      return
    }

    userMutationLocked.current = true
    setSavingUser(true)
    try {
      const response = await authorizedFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Erreur lors de la suppression de l utilisateur.')
      }
      setDeletionNotice(payload.success ? 'Suppression terminée.' : 'Demande enregistrée. Consultez les suppressions de comptes pour suivre le traitement ou vérifier les conditions applicables.')
      if (editingUserId === id) {
        resetUserForm()
      }
      await loadUsers()
      setErrorMessage(null)
    } catch {
      setErrorMessage('Le résultat de la demande doit être vérifié dans les suppressions de comptes avant de recommencer.')
    } finally {
      userMutationLocked.current = false
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

  const handleUserAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !editingUserId || userMutationLocked.current) {
      return
    }

    userMutationLocked.current = true
    setUploadingUserAvatar(true)
    try {
      const avatarUrl = await uploadAdminAvatar(editingUserId, file)
      setExpectedUser(current => current ? { ...current, avatar_url: avatarUrl } : null)
      setUserForm((current) => ({
        ...current,
        avatar_url: avatarUrl,
      }))
      await loadUsers()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Erreur upload avatar admin.')
    } finally {
      userMutationLocked.current = false
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

  if (accessStatus !== 'allowed') return <div className="mx-auto max-w-xl rounded-2xl border border-zinc-800 p-6">
    <p role={accessStatus === 'error' || accessStatus === 'denied' ? 'alert' : 'status'}>
      {accessStatus === 'checking' ? 'Vérification de l’accès administrateur…' : accessStatus === 'unauthenticated' ? 'Connexion requise. Redirection vers la connexion…' : accessStatus === 'denied' ? 'Accès administrateur refusé.' : 'Impossible de vérifier l’accès administrateur. Réessaie.'}
    </p>
    {accessStatus === 'error' && <button type="button" onClick={retry} className="mt-4 rounded-xl bg-cyan-400 px-4 py-2 font-bold text-black focus-visible:outline focus-visible:outline-cyan-300">Réessayer</button>}
  </div>
  return (
    <AdminShell active={section} actions={<>{section==='categories'&&<button disabled={savingCategory} className="admin-action text-cyan-200" onClick={()=>{resetCategoryForm();setCategoryEditorOpen(true)}}>Ajouter une catégorie</button>}{section==='faq'&&<button disabled={savingFaq} className="admin-action text-cyan-200" onClick={()=>{resetFaqForm();setFaqEditorOpen(true)}}>Ajouter une question</button>}{section === 'users' && <button className="admin-action" disabled={loadingUsers || savingUser || uploadingUserAvatar} onClick={() => void loadUsers()}>Actualiser</button>}{section === 'games' && <button className="admin-action" disabled={loadingGames || savingGame || uploadingGameThumbnail} onClick={() => void loadGames()}>Actualiser</button>}{section === 'games' && <>
      <button className="admin-action" onClick={() => void exportCsv('games')}>Exporter CSV</button>
      <button disabled={savingGame || uploadingGameThumbnail} className="admin-action border-cyan-700 text-cyan-200" onClick={() => { resetGameForm(); setGameEditorOpen(true) }}>Ajouter un jeu</button>
    </>}{section === 'users' && <button className="admin-action" onClick={() => void exportCsv('users')}>Exporter CSV</button>}</>}>
      {checking && <p role="status" className="text-sm text-zinc-400">Vérification de l’accès…</p>}
      {errorMessage && <p role="alert" className="rounded-lg border border-rose-900 bg-rose-950/20 p-4 text-sm text-rose-200">{errorMessage}</p>}
      {deletionNotice && <p role="status" className="rounded-lg border border-cyan-900 p-4 text-sm text-cyan-200">{deletionNotice} <Link href="/admin/account-deletions" className="underline">Suivre les demandes</Link>
      </p>}
      {section === 'overview' && <AdminOverview token={sessionToken} />}
      {section === 'games' && <div className="space-y-4">
        <form onSubmit={event => { event.preventDefault(); setGamesPage(1); setGameSearch(gameSearchDraft) }} className="grid items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <FormField label="Rechercher un jeu">
            <input type="search" value={gameSearchDraft} maxLength={80} onChange={event => setGameSearchDraft(event.target.value)} className="border border-zinc-700 bg-black px-3" />
          </FormField>
          <FormField label="Visibilité">
            <select value={gameStatus} onChange={event => { setGameStatus(event.target.value); setGamesPage(1) }} className="border border-zinc-700 bg-black px-3">
              <option value="all">Tous les statuts</option>
              <option value="published">Publiés</option>
              <option value="hidden">Masqués</option>
            </select>
          </FormField>
          <FormField label="Type de jeu">
            <select value={gameTypeFilter} onChange={event => { setGameTypeFilter(event.target.value); setGamesPage(1) }} className="border border-zinc-700 bg-black px-3">
              <option value="all">Tous les types</option>
              <option value="classic">HTML5 legacy</option>
              <option value="multiplayer_chibasko">SDK / multijoueur</option>
            </select>
          </FormField>
          <button type="submit" className="admin-action bg-cyan-400 !text-black">Rechercher</button>
        </form>
        <div className={gameEditorOpen ? 'grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]' : 'min-w-0'}>
          {gameEditorOpen && <AdminEditor identity={editingGameId ?? 'new-game'}>{!editingGameId && <div className="mb-3 text-right">
            <button className="admin-action" disabled={savingGame || uploadingGameThumbnail} onClick={resetGameForm}>Fermer le formulaire</button>
          </div>}<div className="min-w-0">
              <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="text-lg font-black uppercase text-white">
                  {editingGameId ? 'Modifier un jeu' : 'Ajouter un jeu'}
                </h2>
                {editingGameId ? (
                  <button type="button" disabled={savingGame || uploadingGameThumbnail} onClick={resetGameForm} className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300">
                    Annuler
                  </button>
                ) : null}
              </div>

              <form onSubmit={handleGameSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <GameTypeFields type={gameForm.game_type} gameUrl={gameForm.game_url} gameId={gameForm.multiplayer_game_id}
                  onType={type => setGameForm(current => changeGameFormType(current, type, !!editingGameId))}
                  onUrl={url => handleGameChange('game_url', url)} onGameId={id => handleGameChange('multiplayer_game_id', id)} />
                {editingGameId && <p className="text-sm text-zinc-400 md:col-span-2">Changer le type conserve ce jeu et ses données. Les anciens champs de lancement sont effacés ; renseigne ceux du nouveau type.</p>}
                <label className="flex items-center gap-3 md:col-span-2">
                  <input type="checkbox" checked={gameForm.is_beta} onChange={event => handleGameChange('is_beta', event.target.checked)} />Bêta</label>
                <FormField label="Titre">
                  <input aria-label="Titre" value={gameForm.title} onChange={(e) => handleGameChange('title', e.target.value)} placeholder="Titre" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
                </FormField>
                <FormField label="Slug">
                  <input aria-label="Slug" value={gameForm.slug} onChange={(e) => handleGameChange('slug', e.target.value)} placeholder="Slug" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
                </FormField>
                <FormField className="md:col-span-2" label="Miniature">
                  <input aria-label="Miniature" value={gameForm.thumbnail_url} onChange={(e) => handleGameChange('thumbnail_url', e.target.value)} placeholder="Miniature" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>
                <label className="flex min-h-[56px] cursor-pointer items-center justify-between border border-zinc-800 bg-black px-3 text-sm text-zinc-300 md:col-span-2">
                  <span>{uploadingGameThumbnail ? 'Envoi de la miniature…' : 'Importer une miniature'}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml" className="sr-only" onChange={handleGameThumbnailUpload} disabled={uploadingGameThumbnail} />
                  <span className="border border-cyan-700 px-3 py-1 text-xs font-bold text-cyan-300">Choisir</span>
                </label>
                <FormField label="Développeur">
                  <input value={gameForm.developer_name} onChange={(e) => handleGameChange('developer_name', e.target.value)} placeholder="Développeur" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>
                <FormField label="Date de sortie">
                  <input value={gameForm.release_date_text} onChange={(e) => handleGameChange('release_date_text', e.target.value)} placeholder="Date de sortie" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>
                <FormField label="Compatibilite mobile">
                  <input value={gameForm.mobile_compatible} onChange={(e) => handleGameChange('mobile_compatible', e.target.value)} placeholder="Compatibilite mobile" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>
                <FormField label="Technologie">
                  <input value={gameForm.technology} onChange={(e) => handleGameChange('technology', e.target.value)} placeholder="Technologie" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>
                {gameForm.game_type === 'classic' && <>
                  <FormField label="Provider">
                    <input value={gameForm.provider_name} onChange={(e) => handleGameChange('provider_name', e.target.value)} placeholder="Provider" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                  </FormField>
                  <FormField label="Source page URL">
                    <input value={gameForm.source_page_url} onChange={(e) => handleGameChange('source_page_url', e.target.value)} placeholder="Source page URL" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                  </FormField>
                </>}
                <FormField className="md:col-span-2" label="Description">
                  <textarea aria-label="Description" value={gameForm.description} onChange={(e) => handleGameChange('description', e.target.value)} placeholder="Description" className="min-h-36 bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>

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
                  Visible dans le catalogue
                </label>
                <p className="text-sm text-zinc-400 md:col-span-2">{!gameForm.is_published ? 'Non publié : invisible dans le catalogue public.' : gameForm.is_beta ? 'Publié en Bêta : visible avec le badge Bêta.' : 'Publié : visible dans le catalogue public.'}</p>
                <button type="submit" disabled={savingGame} className="bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2">
                  {savingGame ? 'SAUVEGARDE...' : editingGameId ? 'Enregistrer le jeu' : 'Créer le jeu'}
                </button>
              </form>
            </div>
          </AdminEditor>}
          <section className="admin-table-container min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">{loadingGames ? <p role="status" className="p-5 text-sm text-zinc-400">Chargement des jeux…</p> : games.length ? <AdminGameTable games={games} busy={savingGame || uploadingGameThumbnail} onEdit={startEditGame} onDelete={id => void handleDeleteGame(id)} /> : !errorMessage&&<p className="p-6 text-sm text-zinc-400">Aucun jeu dans cette sélection.</p>}{!loadingGames&&!errorMessage&&<AdminPagination label="Pages des jeux administrés" page={gamesPage} total={gamesTotal} busy={loadingGames || savingGame} onPage={setGamesPage} />}
          </section>

        </div>
      </div>}
      {section === 'users' && <div className="space-y-4">
        <form onSubmit={event => { event.preventDefault(); if (userMutationLocked.current) return; setUsersPage(1); setUserSearch(userSearchDraft) }} className="grid items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <FormField label="Rechercher un utilisateur">
            <input type="search" maxLength={80} disabled={savingUser || uploadingUserAvatar} value={userSearchDraft} onChange={event => setUserSearchDraft(event.target.value)} className="border border-zinc-700 bg-black px-3" />
          </FormField>
          <FormField label="Rôle du membre">
            <select disabled={savingUser || uploadingUserAvatar} value={userRoleFilter} onChange={event => { setUserRoleFilter(event.target.value); setUsersPage(1) }} className="border border-zinc-700 bg-black px-3">
              <option value="all">Tous les membres</option>
              <option value="admin">Administrateurs</option>
              <option value="developer">Développeurs</option>
            </select>
          </FormField>
          <button disabled={savingUser || uploadingUserAvatar} type="submit" className="admin-action bg-cyan-400 !text-black">Rechercher</button>
        </form>
        {usersError && <p role="alert" className="rounded-lg border border-rose-900 p-4 text-sm text-rose-200">{usersError} <button className="underline" onClick={() => void loadUsers()}>Réessayer</button>
        </p>}
        <div className={editingUserId ? 'grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]' : 'min-w-0'}>
          {editingUserId && <AdminEditor identity={editingUserId}>
            <div className="min-w-0">
              <div className="mb-6 flex items-center justify-between gap-4">
                <h2 className="text-lg font-black uppercase text-white">
                  {editingUserId ? 'Modifier le profil' : 'Sélectionnez un utilisateur'}
                </h2>
                {editingUserId ? (
                  <button type="button" disabled={savingUser || uploadingUserAvatar} onClick={resetUserForm} className="border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-300">
                    Annuler
                  </button>
                ) : null}
              </div>

              <form onSubmit={handleUserSubmit} className="grid grid-cols-1 gap-4">
                <FormField label="Pseudo">
                  <input disabled={savingUser || uploadingUserAvatar} maxLength={32} value={userForm.username} onChange={(e) => handleUserChange('username', e.target.value)} placeholder="Pseudo" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
                </FormField>
                <FormField label="URL de l’avatar">
                  <input disabled={savingUser || uploadingUserAvatar} maxLength={2048} value={userForm.avatar_url} onChange={(e) => handleUserChange('avatar_url', e.target.value)} placeholder="URL de l’avatar" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>
                <label className="flex min-h-[56px] cursor-pointer items-center justify-between border border-zinc-800 bg-black px-3 text-sm text-zinc-300">
                  <span>{uploadingUserAvatar ? 'Envoi de l’avatar…' : 'Importer un avatar'}</span>
                  <input type="file" accept="image/*,.ico" className="sr-only" onChange={handleUserAvatarUpload} disabled={!editingUserId || uploadingUserAvatar || savingUser} />
                  <span className="border border-cyan-700 px-3 py-1 text-xs font-bold text-cyan-300">Choisir</span>
                </label>
                <FormField label="Biographie">
                  <textarea disabled={savingUser || uploadingUserAvatar} maxLength={16384} value={userForm.bio} onChange={(e) => handleUserChange('bio', e.target.value)} placeholder="Bio" className="min-h-32 bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
                </FormField>
                <button type="submit" disabled={savingUser || !editingUserId || uploadingUserAvatar} className="bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60">
                  {savingUser ? 'Enregistrement…' : 'Enregistrer le profil'}
                </button>
              </form>
            </div>
          </AdminEditor>}
          <section className="admin-table-container min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">{loadingUsers ? <p role="status" className="p-5 text-sm text-zinc-400">Chargement des utilisateurs…</p> : users.length ? <AdminUserTable users={users} actor={session?.user.id} busy={savingUser || uploadingUserAvatar} onEdit={startEditUser} onDelete={id => void handleDeleteUser(id)} /> : !usersError && <p className="p-6 text-sm text-zinc-400">Aucun utilisateur dans cette sélection.</p>}{!loadingUsers&&!usersError&&<AdminPagination label="Pages des comptes" page={usersPage} total={usersTotal} busy={loadingUsers || savingUser || uploadingUserAvatar} onPage={setUsersPage} />}
          </section>

        </div>
      </div>}
      {section==='categories'&&<div className={categoryEditorOpen?'grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]':'min-w-0'}>
 {categoryEditorOpen&&<AdminEditor identity={editingCategoryId??'new-category'}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold">{editingCategoryId?'Modifier la catégorie':'Ajouter une catégorie'}</h2><button type="button" disabled={savingCategory} className="admin-action" onClick={resetCategoryForm}>Fermer</button></div><form onSubmit={handleCategorySubmit} className="space-y-4">
          <FormField label="Nom de catégorie">
            <input
              value={categoryForm.name}
              onChange={(event) => {
                const nextName = event.target.value
                setCategoryForm((current) => ({
                  ...current,
                  name: nextName,
                  slug: !editingCategoryId&&(!current.slug||current.slug===slugifyCategory(current.name))?slugifyCategory(nextName):current.slug,
                }))
              }}
              placeholder="Nom de catégorie"
              className="w-full bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500"
              required
            />
          </FormField>
          <FormField label="Slug de catégorie">
            <input
              value={categoryForm.slug}
              onChange={(event) => setCategoryForm((current) => ({ ...current, slug: slugifyCategory(event.target.value) }))}
              placeholder="Slug de catégorie"
              className="w-full bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500"
              required
            />
          </FormField>
          <button type="submit" disabled={savingCategory} className="w-full bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60">
            {savingCategory ? 'SAUVEGARDE...' : editingCategoryId ? 'Enregistrer la catégorie' : 'Créer la catégorie'}
          </button>
        </form></AdminEditor>}
 <section className="admin-table-container min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">{loadingCategories?<p role="status" className="p-5 text-sm text-zinc-400">Chargement des catégories…</p>:categories.length?<table className="admin-table"><caption className="sr-only">Catégories du catalogue</caption><thead><tr><th scope="col">Catégorie</th><th scope="col">Jeux</th><th scope="col">Actions</th></tr></thead><tbody>{categories.map(category=><tr key={category.id}><td><p className="font-semibold text-white">{category.name}</p><p className="text-xs text-zinc-500">{category.slug}</p></td><td className="text-sm text-zinc-400">{category.games_count??0} jeux</td><td><div className="flex flex-wrap gap-2"><button type="button" disabled={savingCategory} className="admin-action" onClick={()=>startEditCategory(category)}>Modifier<span className="sr-only"> {category.name}</span></button><button type="button" disabled={savingCategory} className="admin-action text-rose-300" onClick={()=>void handleDeleteCategory(category.id)}>Supprimer<span className="sr-only"> {category.name}</span></button></div></td></tr>)}</tbody></table>:!errorMessage&&<p className="p-6 text-sm text-zinc-400">Aucune catégorie.</p>}</section>
</div>}
      {section==='faq'&&<div className={faqEditorOpen?'grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]':'min-w-0'}>
 {faqEditorOpen&&<AdminEditor identity={editingFaqId??'new-question'}><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-bold">{editingFaqId?'Modifier la question':'Ajouter une question'}</h2><button type="button" disabled={savingFaq} className="admin-action" onClick={resetFaqForm}>Fermer</button></div><form onSubmit={handleFaqSubmit} className="grid grid-cols-1 gap-4">
            <FormField label="Question">
              <input value={faqForm.question} onChange={(event) => setFaqForm((current) => ({ ...current, question: event.target.value }))} placeholder="Question" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            </FormField>
            <FormField label="Réponse">
              <textarea value={faqForm.answer} onChange={(event) => setFaqForm((current) => ({ ...current, answer: event.target.value }))} placeholder="Reponse" className="min-h-40 bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" required />
            </FormField>
            <FormField label="Ordre d’affichage">
              <input value={faqForm.sort_order} onChange={(event) => setFaqForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))} placeholder="Ordre d affichage" type="number" className="bg-black border border-zinc-800 p-3 text-white outline-none focus:border-cyan-500" />
            </FormField>
            <label className="flex items-center gap-3 text-sm text-zinc-300">
              <input type="checkbox" checked={faqForm.is_published} onChange={(event) => setFaqForm((current) => ({ ...current, is_published: event.target.checked }))} />
              Question publiée sur la page FAQ
            </label>
            <button type="submit" disabled={savingFaq} className="bg-cyan-600 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-60">
              {savingFaq ? 'SAUVEGARDE...' : editingFaqId ? 'Enregistrer la question' : 'Créer la question'}
            </button>
          </form></AdminEditor>}
 <section className="admin-table-container min-w-0 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">{loadingFaq?<p role="status" className="p-5 text-sm text-zinc-400">Chargement des questions…</p>:faqEntries.length?<table className="admin-table"><caption className="sr-only">Questions fréquentes</caption><thead><tr><th scope="col">Question</th><th scope="col">Ordre</th><th scope="col">Statut</th><th scope="col">Actions</th></tr></thead><tbody>{faqEntries.map(entry=><tr key={entry.id}><td><p className="font-semibold text-white">{entry.question}</p><details className="mt-2 text-xs text-zinc-400"><summary className="cursor-pointer text-cyan-300">Voir la réponse</summary><p className="mt-2 whitespace-pre-wrap break-words">{entry.answer}</p></details></td><td><span className="admin-cell-label text-zinc-500">Ordre : </span>{entry.sort_order}</td><td><span className={'text-xs '+(entry.is_published?'text-emerald-300':'text-zinc-500')}>{entry.is_published?'Publiée':'Masquée'}</span></td><td><div className="flex flex-wrap gap-2"><button type="button" disabled={savingFaq} className="admin-action" onClick={()=>startEditFaq(entry)}>Modifier<span className="sr-only"> {entry.question}</span></button><button type="button" disabled={savingFaq} className="admin-action text-rose-300" onClick={()=>void handleDeleteFaq(entry.id)}>Supprimer<span className="sr-only"> {entry.question}</span></button></div></td></tr>)}</tbody></table>:!errorMessage&&<p className="p-6 text-sm text-zinc-400">Aucune question.</p>}</section>
</div>}
    </AdminShell>
  )
}

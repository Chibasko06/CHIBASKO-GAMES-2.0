'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { suppressLobbyAnalytics } from '@/components/SiteAnalytics'
import { multiplayerError, type ProductGame } from '@/lib/multiplayer/productSession'
import type { PublicLobbySummary } from '@/lib/multiplayer/publicLobbies'
import { useMultiplayer } from './MultiplayerProvider'
import { AuthInvitation, multiplayerButton } from './MultiplayerEntry'

export default function PublicLobbyBrowser({ game }: { game: ProductGame }) {
  const { user, loading: authLoading } = useAuth()
  if (authLoading) return <p role="status">Vérification de la connexion…</p>
  if (!user) return <AuthInvitation next={`/games/${game.slug}/online`} />
  return <AuthenticatedBrowser key={`${user.id}:${game.gameId}`} game={game} />
}

function AuthenticatedBrowser({ game }: { game: ProductGame }) {
  const { controller, state, available } = useMultiplayer()
  const router = useRouter()
  const [lobbies, setLobbies] = useState<PublicLobbySummary[]>([])
  const [loading, setLoading] = useState(available)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)
  const load = useCallback((request: AbortController) => {
    return controller.listPublic(game.gameId, request.signal).then(next => {
      if (!request.signal.aborted) setLobbies(next)
    }, err => {
      if (!request.signal.aborted) {
        setLobbies([]); setError(multiplayerError(err instanceof Error && err.name === 'TimeoutError' ? 'TIMEOUT' : err))
        if (err instanceof Error && err.message === 'AUTH_REQUIRED') router.replace(`/login?next=${encodeURIComponent(`/games/${game.slug}/online`)}`)
      }
    }).finally(() => { if (!request.signal.aborted) setLoading(false) })
  }, [controller, game.gameId, game.slug, router])
  function refresh() {
    pending.current?.abort()
    const request = new AbortController(); pending.current = request
    setLoading(true); setError(''); void load(request)
  }
  useEffect(() => {
    if (!available) return
    const request = new AbortController(); pending.current = request
    void load(request)
    return () => { pending.current?.abort() }
  }, [available, load])
  async function enter(code?: string) {
    pending.current?.abort(); setLoading(false); setError('')
    const joined = await controller.connect(game, code, code ? { publicOnly: true } : { visibility: 'public' })
    if (joined) { suppressLobbyAnalytics(); router.push(`/games/${joined.slug}/lobby/${joined.code}`) }
    else if (code) setLobbies(rows => rows.filter(row => row.code !== code))
  }
  const disabled = state.busy || !available || !!state.unavailable
  return <div className="space-y-5">
    {!available && <p role="status">Le multijoueur de Chibasko Games est temporairement indisponible.</p>}
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={() => void enter()} disabled={disabled} className={multiplayerButton}>Créer un salon public</button>
      <button type="button" onClick={() => void refresh()} disabled={disabled || loading} className={multiplayerButton}>Actualiser</button>
      {state.unavailable && <button type="button" onClick={controller.retry} className={multiplayerButton}>Réessayer la connexion</button>}
    </div>
    <p role="status" aria-live="polite">{state.busy ? 'Connexion à la partie…' : loading ? 'Chargement des salons…' : available && !error && !lobbies.length ? 'Aucun salon public n’attend de joueur pour le moment.' : ''}</p>
    {(error || state.error) && <p role="alert" className="text-sm text-amber-200">{error || state.error}</p>}
    <ul aria-label="Salons publics disponibles" className="space-y-3">
      {lobbies.map(lobby => <li key={lobby.code} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
        <div className="min-w-0 flex-1"><h2 className="break-words font-bold">Salon de {lobby.host.username}</h2><p className="text-sm text-zinc-400">{lobby.currentPlayers} / {lobby.maxPlayers} joueurs · En attente</p></div>
        <button type="button" onClick={() => void enter(lobby.code)} disabled={disabled} aria-label={`Rejoindre le salon de ${lobby.host.username}`} className={multiplayerButton}>Rejoindre</button>
      </li>)}
    </ul>
    <p className="text-xs text-zinc-500">Les places peuvent évoluer. Actualise la liste pour voir les salons disponibles.</p>
  </div>
}

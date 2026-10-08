'use client'
import { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useMultiplayer } from './MultiplayerProvider'
import { normalizeLobbyCode } from '@/lib/lobbyConnection'
import { multiplayerError, type ProductGame } from '@/lib/multiplayer/productSession'
import { safeAuthNext } from '@/lib/authRedirect'
import { suppressLobbyAnalytics } from '@/components/SiteAnalytics'

export const multiplayerButton = 'rounded-full border border-cyan-700 px-5 py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-950/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50'
export function AuthInvitation({ next }: { next: string }) {
  const query = `?next=${encodeURIComponent(safeAuthNext(next))}`
  return <div role="status" className="space-y-3 text-sm text-zinc-300"><p>Connecte-toi à ton compte Chibasko Games pour rejoindre ou créer une partie.</p><div className="flex flex-wrap gap-3"><Link className={multiplayerButton} href={`/login${query}`}>Se connecter</Link><Link className={multiplayerButton} href={`/register${query}`}>Créer un compte</Link></div></div>
}
export default function MultiplayerEntry({ available = true, game, directCode, global = false }: { available?: boolean; game?: ProductGame; directCode?: string; global?: boolean }) {
  const { user, loading } = useAuth()
  const { controller, state, available: serviceAvailable } = useMultiplayer()
  const router = useRouter()
  const params = useSearchParams()
  const [open, setOpen] = useState(global || !!directCode || params.get('multiplayer') === '1')
  const [invitation, setInvitation] = useState(false)
  const [error, setError] = useState('')
  const [code, setCode] = useState(directCode ?? params.get('join') ?? '')
  const id = useId()
  const next = game ? `/games/${game.slug}${directCode ? `/lobby/${directCode}` : '?multiplayer=1'}` : '/multiplayer'
  const [authNext, setAuthNext] = useState(next)
  async function action(create: boolean) {
    setError('')
    if (!user) {
      try {
        const normalized = create ? undefined : normalizeLobbyCode(code)
        setAuthNext(normalized ? game ? `/games/${game.slug}/lobby/${normalized}` : `/multiplayer?join=${normalized}` : next)
        setInvitation(true)
      } catch (err) { setError(multiplayerError(err)) }
      return
    }
    if (!serviceAvailable || !available || state.unavailable) return
    try {
      const normalized = create ? undefined : normalizeLobbyCode(code)
      const joined = await controller.connect(game ?? null, normalized)
      if (joined) { suppressLobbyAnalytics(); router.push(`/games/${joined.slug}/lobby/${joined.code}`) }
    } catch (err) { setError(multiplayerError(err)) }
  }
  const disabled = loading || state.busy || !serviceAvailable || !available || !!state.unavailable
  return <div className="space-y-4">
    {(!serviceAvailable || !available) && <p role="status" className="text-sm text-zinc-400">Le multijoueur de Chibasko Games est temporairement indisponible.</p>}
    {state.unavailable && <button type="button" onClick={controller.retry} className={multiplayerButton}>Réessayer la connexion</button>}
    {!global && !directCode && <button type="button" disabled={!available} aria-expanded={open} aria-controls={`${id}-entry`} onClick={() => setOpen(v => !v)} className={multiplayerButton}>Jouer en multijoueur</button>}
    {open && <div id={`${id}-entry`} className="space-y-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 sm:p-5">
      {game && !directCode && <button type="button" onClick={() => void action(true)} disabled={disabled} className={multiplayerButton}>Créer une partie</button>}
      <form onSubmit={event => { event.preventDefault(); void action(false) }} className="space-y-2">
        <label htmlFor={`${id}-code`} className="block text-sm font-semibold">{directCode ? 'Code de cette partie' : 'Code de partie'}</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id={`${id}-code`} value={code} readOnly={!!directCode} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={12} required autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="AB7KQ2" className="min-w-0 w-full rounded-xl border border-zinc-700 bg-black px-4 py-3 font-mono uppercase tracking-[0.2em] focus:outline-cyan-300" />
          <button type="submit" disabled={disabled || !code.trim()} className={multiplayerButton}>{directCode ? 'Rejoindre cette partie' : 'Rejoindre'}</button>
        </div>
      </form>
      {state.busy && <p role="status">Connexion à la partie…</p>}
      {(error || state.error) && <p role="alert" className="text-sm text-amber-200">{error || state.error}</p>}
      {invitation && !user && <AuthInvitation next={authNext} />}
    </div>}
  </div>
}

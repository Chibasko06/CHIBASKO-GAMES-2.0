'use client'
import { useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMultiplayer } from './MultiplayerProvider'
import MultiplayerEntry, { multiplayerButton } from './MultiplayerEntry'
import { isProductGameReady, type ProductGame, type ProductSnapshot } from '@/lib/multiplayer/productSession'
const noSubscription = () => () => {}
const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

export function LobbyView({ title, state, onReady, onStart, onLeave }: { title: string; state: ProductSnapshot; onReady(value: boolean): void; onStart(): void; onLeave(): void }) {
  const [feedback, setFeedback] = useState('')
  const shareAvailable = useSyncExternalStore(noSubscription, canShare, () => false)
  const lobby = state.lobby
  if (!lobby) return null
  const self = lobby.players.find(player => player.self)
  const reason = lobby.players.length < lobby.minPlayers ? 'En attente d’un autre joueur.' : lobby.players.some(p => !p.ready) ? 'Tous les joueurs doivent être prêts, y compris l’hôte.' : ''
  const waiting = lobby.status === 'WAITING'
  const playing = isProductGameReady(state)
  async function copy() {
    try { await navigator.clipboard.writeText(lobby!.code); setFeedback('Code copié') }
    catch { setFeedback('Copie le code affiché ci-dessus pour partager la partie.') }
  }
  async function share() {
    try { await navigator.share({ title, url: `${window.location.origin}/games/${lobby!.slug}/lobby/${lobby!.code}` }) }
    catch { setFeedback('Le partage a été annulé. Tu peux copier le code.') }
  }
  return <section className="mx-auto max-w-3xl space-y-6 rounded-[28px] border border-cyan-900/60 bg-zinc-950 p-5 sm:p-8">
    <header><p className="text-xs uppercase tracking-widest text-cyan-300">Partie privée · Chibasko Games</p><h1 className="mt-3 break-words text-3xl font-black">{title}</h1></header>
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-black/40 p-4">
      <div className="min-w-0 flex-1"><p className="text-sm text-zinc-400">Code de partie</p><strong className="font-mono text-2xl tracking-[0.15em] text-cyan-200">{lobby.code}</strong></div>
      <button type="button" className={multiplayerButton} onClick={() => void copy()}>Copier</button>
      {shareAvailable && <button type="button" className={multiplayerButton} onClick={() => void share()}>Partager</button>}
    </div>
    <p role="status" aria-live="polite">{feedback}</p>
    <p className="font-semibold">{lobby.players.length} / {lobby.maxPlayers} joueurs</p>
    <ul className="space-y-3">{lobby.players.map((player, index) => <li key={index} className="flex min-w-0 items-center gap-3 rounded-2xl border border-zinc-800 p-4">
      {player.avatarUrl ? <Image src={player.avatarUrl} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-950 text-cyan-200">{player.username.slice(0, 1).toUpperCase()}</span>}
      <div className="min-w-0 flex-1"><p className="break-words font-bold">{player.username} {player.self && <span className="font-normal text-zinc-400">(toi)</span>}</p>{player.host && <span className="text-xs text-amber-200">♛ Hôte</span>}</div>
      <span className="shrink-0 text-sm">{player.ready ? '✓ Prêt' : 'Pas prêt'}</span>
    </li>)}</ul>
    <div role="status" aria-live="polite">
      {lobby.status === 'STARTING' && <div className="rounded-2xl border border-cyan-900 bg-cyan-950/20 p-5"><h2 className="text-xl font-bold">La partie démarre…</h2><p className="mt-2 text-zinc-300">{state.game.connected ? 'En attente des autres joueurs…' : 'Connexion au serveur de jeu…'}</p></div>}
      {playing && <div className="space-y-4 rounded-2xl border border-cyan-700 bg-cyan-950/20 p-6 text-center"><h2 className="text-2xl font-black">Partie prête</h2><p>{state.game.count} / {state.game.expected} joueurs connectés</p><div aria-hidden="true" className="rounded-xl border border-dashed border-cyan-800 p-8 text-4xl">✦</div><p>La connexion est prête. Ce prototype ne contient pas encore de jeu jouable.</p></div>}
      {lobby.status === 'PLAYING' && !playing && <p>Connexion à la partie…</p>}
    </div>
    {state.error && <p role="alert" className="text-sm text-amber-200">{state.error}</p>}
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <button type="button" disabled={!waiting || !self} onClick={() => onReady(!self?.ready)} className={multiplayerButton}>{self?.ready ? 'Annuler prêt' : 'Je suis prêt'}</button>
      {self?.host && <button type="button" disabled={!waiting || !!reason} aria-describedby="start-reason" onClick={onStart} className={multiplayerButton}>Lancer la partie</button>}
      <button type="button" onClick={onLeave} className={multiplayerButton}>Quitter la partie</button>
    </div>
    {waiting && <p id="start-reason" className="text-sm text-zinc-400">{reason || 'Tous les joueurs sont prêts. L’hôte peut lancer la partie.'}</p>}
  </section>
}
export default function LobbyExperience({ game, title, code }: { game: ProductGame; title: string; code: string }) {
  const { controller, state } = useMultiplayer()
  const router = useRouter()
  const active = state.lobby?.slug === game.slug && state.lobby.code === code
  if (!active) return <section className="mx-auto max-w-3xl space-y-5 rounded-[28px] border border-cyan-900/60 bg-zinc-950 p-5 sm:p-8"><h1 className="text-3xl font-black">{title}</h1><h2 className="text-xl font-bold">Rejoindre cette partie</h2><p className="text-sm text-zinc-400">Après une actualisation, rejoins à nouveau la partie. Si ton compte est encore présent, attends quelques secondes puis réessaie.</p><MultiplayerEntry game={game} directCode={code} /><Link className="inline-block text-cyan-300 underline" href={`/games/${game.slug}`}>Retour au jeu</Link></section>
  return <LobbyView title={title} state={state} onReady={controller.ready} onStart={controller.start} onLeave={() => { controller.disconnect(); router.push(`/games/${game.slug}`) }} />
}

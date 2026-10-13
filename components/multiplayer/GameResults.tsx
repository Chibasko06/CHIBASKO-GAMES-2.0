'use client'
import type { ProductResult } from '@/lib/multiplayer/productSession'
import { multiplayerButton } from './MultiplayerEntry'

export default function GameResults({ result, host, onReturn }: { result: ProductResult; host: boolean; onReturn?: () => void }) {
  return <section aria-label="Résultat de la partie" className="space-y-5 rounded-2xl border border-cyan-800/60 bg-gradient-to-b from-cyan-950/30 to-zinc-950 p-5 text-center motion-safe:animate-[pulse_450ms_ease-out_1] sm:p-8">
    <div role="status" aria-live="polite" aria-atomic="true">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Partie terminée</p>
      <h2 className="mt-2 text-3xl font-black">{result.outcome === 'win' ? 'Victoire !' : result.outcome === 'loss' ? 'Défaite' : 'Partie terminée'}</h2>
      <p className="mt-3 break-words text-lg">{result.winner ? `${result.winner} remporte la partie` : 'Merci d’avoir joué !'}</p>
      {result.reason === 'forfeit' && <p className="mt-2 text-sm text-amber-200">Victoire par abandon</p>}
    </div>
    {result.players.length > 0 && result.players.every(p => p.score !== undefined) && <div className="space-y-2 rounded-xl bg-black/30 p-4">
      <p className="text-4xl font-black tabular-nums text-cyan-100">{result.players.map(p => p.score).join(' – ')}</p>
      <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-zinc-300">{result.players.map((p, index) => <li key={index} className="min-w-0 break-words">{p.username} : {p.score}</li>)}</ul>
    </div>}
    {host ? <button type="button" disabled={!onReturn} className={multiplayerButton} onClick={onReturn}>Retour à la salle d’attente</button> : <p className="text-sm text-zinc-400">En attente de l’hôte…</p>}
  </section>
}

'use client'
import { multiplayerGames, multiplayerCapacityLabel, type GameType } from '@/lib/multiplayer/catalogue'

export default function GameTypeFields({ type, gameUrl, gameId, onType, onUrl, onGameId }: {
  type: GameType; gameUrl: string; gameId: string
  onType(type: GameType): void; onUrl(url: string): void; onGameId(id: string): void
}) {
  return <fieldset className="space-y-4 rounded-2xl border border-cyan-900/60 bg-black/30 p-4 md:col-span-2">
    <legend className="px-2 font-bold text-cyan-200">Type de jeu</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      {([{ value: 'classic', title: 'Jeu classique', detail: 'HTML5, URL ou iframe' },
        { value: 'multiplayer_chibasko', title: 'Multijoueur Chibasko Games', detail: 'Salle d’attente et jeu intégrés' }] as const).map(option => <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-700 p-3 focus-within:border-cyan-400">
        <input type="radio" name="game_type" value={option.value} checked={type === option.value} onChange={() => onType(option.value)} className="mt-1 accent-cyan-400" />
        <span><span className="block text-sm font-bold">{option.title}</span><span className="block text-xs text-zinc-400">{option.detail}</span></span>
      </label>)}
    </div>
    {type === 'classic' ? <label className="block space-y-2"><span className="text-sm">URL du jeu <span className="text-zinc-400">(obligatoire)</span></span>
      <input type="url" required value={gameUrl} onChange={e => onUrl(e.target.value)} placeholder="https://…" className="block w-full rounded-xl border border-zinc-700 bg-black p-3 focus:border-cyan-400 focus:outline-none" />
    </label> : <div className="space-y-3">
      <p className="text-sm text-zinc-300">Ce jeu est chargé directement par Chibasko Games. Aucune URL de jeu n’est nécessaire.</p>
      <label className="block space-y-2"><span className="text-sm">Multiplayer Game ID <span className="text-zinc-400">(obligatoire)</span></span>
        <select required value={gameId} onChange={e => onGameId(e.target.value)} className="block w-full rounded-xl border border-zinc-700 bg-black p-3 focus:border-cyan-400 focus:outline-none">
          <option value="">Choisir un jeu multijoueur</option>
          {multiplayerGames.map(game => <option key={game.gameId} value={game.gameId}>{game.label} — {game.gameId}</option>)}
        </select>
      </label>
      <p className="text-sm text-cyan-200"><output>Capacité : {multiplayerCapacityLabel(gameId)}</output><span className="block text-xs text-zinc-400">Lecture seule · définition du registre serveur</span></p>
    </div>}
  </fieldset>
}

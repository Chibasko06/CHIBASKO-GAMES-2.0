'use client'
import { useState } from 'react'
import { useMultiplayer } from '@/components/multiplayer/MultiplayerProvider'
import { LobbyView } from '@/components/multiplayer/LobbyExperience'
import { multiplayerButton } from '@/components/multiplayer/MultiplayerEntry'

const game = { slug: 'chibasko-pong', gameId: 'chibasko-pong' }
export default function LobbyPlaygroundClient() {
  const { controller, state } = useMultiplayer()
  const [code, setCode] = useState('')
  return <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
    <h1 className="text-3xl font-bold">Test local · Chibasko Games</h1>
    <p className="text-zinc-400">Pong 1v1 technique, non publié. Deux comptes distincts sont nécessaires. Aucun score n’est sauvegardé.</p>
    {state.lobby ? <LobbyView title="Chibasko Pong · test local" state={state} shareable={false} onReady={controller.ready} onStart={controller.start} onReturn={controller.returnToLobby} onInput={controller.input} onLeave={() => controller.disconnect()} /> : <section className="space-y-4">
      <button className={multiplayerButton} disabled={state.busy} onClick={() => void controller.connect(game)}>Créer une partie de test</button>
      <label className="block">Code de partie<input className="mt-2 block w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3" maxLength={6} value={code} onChange={event => setCode(event.target.value)} /></label>
      <button className={multiplayerButton} disabled={state.busy || !code.trim()} onClick={() => void controller.connect(game, code)}>Rejoindre</button>
      <p role="status" aria-live="polite">{state.busy ? 'Connexion…' : 'Connecte-toi à Chibasko Games sur ce site local avant de créer ou rejoindre.'}</p>
      {state.error && <p role="alert">{state.error}</p>}
    </section>}
  </main>
}

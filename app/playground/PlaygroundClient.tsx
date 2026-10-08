'use client'

import { useEffect, useRef, useState } from 'react'
import { Client, type Room } from '@colyseus/sdk'

type Player = { sessionId: string; x: number; y: number }
type State = { players: { forEach(callback: (player: Player) => void): void; get(id: string): Player | undefined } }

export default function PlaygroundClient() {
  const roomRef = useRef<Room<State> | null>(null)
  const connecting = useRef(false)
  const generation = useRef(0)
  const [players, setPlayers] = useState<Player[]>([])
  const [identity, setIdentity] = useState<{ roomId: string; sessionId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Serveur local attendu sur 127.0.0.1:2567.')

  useEffect(() => () => {
    generation.current++
    const room = roomRef.current
    roomRef.current = null
    void room?.leave().catch(() => {})
  }, [])

  async function connect() {
    if (connecting.current || roomRef.current) return
    connecting.current = true
    setBusy(true)
    const attempt = ++generation.current
    try {
      const room = await new Client('http://127.0.0.1:2567').joinOrCreate<State>('playground')
      room.reconnection.enabled = false
      if (attempt !== generation.current) { await room.leave(); return }
      roomRef.current = room
      setIdentity({ roomId: room.roomId, sessionId: room.sessionId })
      setMessage('Connecté. Déplacez-vous avec les boutons.')
      const refresh = (state: State) => {
        if (roomRef.current !== room) return
        const next: Player[] = []
        state.players.forEach(p => next.push({ sessionId: p.sessionId, x: p.x, y: p.y }))
        setPlayers(next.sort((a, b) => a.sessionId.localeCompare(b.sessionId)))
      }
      room.onStateChange(refresh)
      room.onMessage('move_rejected', () => {
        if (roomRef.current === room) setMessage('Déplacement refusé : une case, limites 0–100, maximum 10 par seconde.')
      })
      room.onError(() => { if (roomRef.current === room) setMessage('Erreur de connexion au serveur local.') })
      room.onLeave(() => {
        if (roomRef.current !== room) return
        roomRef.current = null
        setIdentity(null)
        setPlayers([])
        setMessage('Déconnecté du serveur local.')
      })
      if (room.state?.players) refresh(room.state)
    } catch {
      if (attempt === generation.current) setMessage('Connexion impossible. Lancez le serveur Colyseus local puis réessayez.')
    } finally {
      connecting.current = false
      if (attempt === generation.current) setBusy(false)
    }
  }

  async function disconnect() {
    const room = roomRef.current
    if (!room) return
    setBusy(true)
    try { await room.leave() } catch { setMessage('La connexion est déjà interrompue.') }
    finally {
      if (roomRef.current === room) roomRef.current = null
      setIdentity(null)
      setPlayers([])
      setBusy(false)
    }
  }

  function move(dx: number, dy: number) {
    const room = roomRef.current
    const player = room?.state.players.get(room.sessionId)
    if (!room || !player) return
    room.send('move', { x: player.x + dx, y: player.y + dy })
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-bold">Playground multijoueur local</h1>
      <p>Ouvrez cette page dans deux onglets et connectez-les à la même room. Identités temporaires, sans compte Chibasko.</p>
      <div className="flex gap-3">
        <button className="rounded bg-indigo-600 px-4 py-2 disabled:opacity-50" disabled={busy || !!identity} onClick={() => void connect()}>Connexion</button>
        <button className="rounded bg-zinc-700 px-4 py-2 disabled:opacity-50" disabled={busy || !identity} onClick={() => void disconnect()}>Déconnexion</button>
      </div>
      <p role="status" aria-live="polite">{message}</p>
      {identity && <p className="break-all">Room : <code>{identity.roomId}</code><br />Votre session : <code>{identity.sessionId}</code></p>}
      <div className="flex flex-wrap gap-2" aria-label="Déplacements">
        {([['Gauche', -1, 0], ['Haut', 0, -1], ['Bas', 0, 1], ['Droite', 1, 0]] as const).map(([label, dx, dy]) => (
          <button key={label} className="rounded border border-zinc-600 px-4 py-2 disabled:opacity-50" disabled={busy || !identity} onClick={() => move(dx, dy)}>{label}</button>
        ))}
      </div>
      <h2 className="text-xl font-semibold">Joueurs connectés : {players.length}</h2>
      <ul className="space-y-2">
        {players.map(player => <li key={player.sessionId} className="break-all rounded bg-zinc-900 p-3"><code>{player.sessionId}</code>{player.sessionId === identity?.sessionId ? ' (vous)' : ''} — x : {player.x}, y : {player.y}</li>)}
      </ul>
    </main>
  )
}

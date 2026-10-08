'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { createPlaygroundSession } from '@/lib/playgroundSession'
import { connectLobby, type LobbyPlayer } from '@/lib/lobbyConnection'

type LobbyRoom = Awaited<ReturnType<typeof connectLobby>>
type Snapshot = { code: string; status: string; hostUserId: string; sessionId: string; players: (LobbyPlayer & { sessionId: string })[] }
export default function LobbyPlaygroundClient() {
  const connection = useRef<ReturnType<typeof createPlaygroundSession<LobbyRoom>> | null>(null)
  const roomRef = useRef<LobbyRoom | null>(null)
  const mode = useRef<string | undefined>(undefined)
  const pending = useRef(false)
  const [code, setCode] = useState('')
  const [lobby, setLobby] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Connectez-vous à Chibasko sur ce site local.')
  useEffect(() => {
    const controller = createPlaygroundSession(async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw new Error('Session unavailable')
      return data.session
    }, token => connectLobby(token, mode.current))
    connection.current = controller
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => controller.accountChanged(session?.user.id ?? null))
    return () => { roomRef.current = null; controller.dispose(); connection.current = null; subscription.unsubscribe() }
  }, [])
  async function join(creating: boolean) {
    if (pending.current || roomRef.current) return
    pending.current = true; setBusy(true)
    mode.current = creating ? undefined : code
    const controller = connection.current
    try {
      const room = await controller?.connect()
      if (!room) return
      if (connection.current !== controller) { await room.leave(); return }
      roomRef.current = room
      const refresh = () => {
        if (roomRef.current !== room) return
        const players: Snapshot['players'] = []
        room.state.players.forEach((player, sessionId) => players.push({ sessionId, userId: player.userId, username: player.username, avatarUrl: player.avatarUrl, ready: player.ready }))
        setLobby({ code: room.state.code, status: room.state.status, hostUserId: room.state.hostUserId, sessionId: room.sessionId, players })
      }
      room.onStateChange(refresh)
      room.onMessage('lobby_error', () => setMessage('Action refusée par le serveur.'))
      room.onError(() => setMessage('Connexion interrompue.'))
      room.onLeave(() => {
        if (roomRef.current !== room) return
        roomRef.current = null; setLobby(null); setMessage('Lobby quitté ou connexion expirée.')
      })
      refresh(); setMessage('Lobby connecté.')
    } catch { setMessage('Connexion refusée : vérifiez le compte, le code et la disponibilité du lobby.') }
    finally { pending.current = false; setBusy(false) }
  }
  const self = lobby?.players.find(player => player.sessionId === lobby.sessionId)
  const host = !!self && self.userId === lobby?.hostUserId
  const canStart = lobby?.status === 'WAITING' && lobby.players.length >= 2 && lobby.players.every(player => player.ready)
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-10">
    <h1 className="text-3xl font-bold">Lobby Chibasko local</h1>
    <p role="status">{message}</p>
    {!lobby ? <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={() => void join(true)}>Créer un lobby</button>
      <label>Code du lobby <input value={code} maxLength={12} onChange={event => setCode(event.target.value)} className="rounded border p-2" /></label>
      <button disabled={busy || !code.trim()} onClick={() => void join(false)}>Rejoindre</button>
    </div> : <>
      <p>Code : <strong>{lobby.code}</strong></p><p>Statut : <strong>{lobby.status}</strong></p>
      <p>Joueurs : {lobby.players.length} / 4</p>
      <ul>{lobby.players.map(player => <li key={player.sessionId} className="my-2 rounded border p-3">
        {player.avatarUrl && <Image src={player.avatarUrl} alt="" width={40} height={40} />}
        <strong>{player.username}</strong> {player.userId === lobby.hostUserId && <span>HOST</span>} {player.sessionId === self?.sessionId && <span>(vous)</span>} — {player.ready ? 'Ready' : 'Not ready'}
      </li>)}</ul>
      <div className="flex gap-4">
        <button disabled={lobby.status !== 'WAITING'} onClick={() => roomRef.current?.send('set_ready', { ready: !self?.ready })}>{self?.ready ? 'Annuler Ready' : 'Ready'}</button>
        <button onClick={() => connection.current?.disconnect()}>Quitter</button>
        {host && <button disabled={!canStart} onClick={() => roomRef.current?.send('start_game')}>Start</button>}
      </div>
    </>}
  </main>
}

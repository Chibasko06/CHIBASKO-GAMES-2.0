'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'
import { createPlaygroundSession } from '@/lib/playgroundSession'
import { connectLobby, type LobbyPlayer } from '@/lib/lobbyConnection'
import { createLobbyGameSession } from '@/lib/lobbyGameSession'

type LobbyRoom = Awaited<ReturnType<typeof connectLobby>>
type Snapshot = { code: string; status: string; hostUserId: string; sessionId: string; gameId: string; minPlayers: number; maxPlayers: number; players: (LobbyPlayer & { sessionId: string })[] }
export default function LobbyPlaygroundClient() {
  const connection = useRef<ReturnType<typeof createPlaygroundSession<LobbyRoom>> | null>(null)
  const roomRef = useRef<LobbyRoom | null>(null)
  const mode = useRef<string | undefined>(undefined)
  const pending = useRef(false)
  const gameConnection = useRef<ReturnType<typeof createLobbyGameSession> | null>(null)
  const [game, setGame] = useState<{ connected: boolean; count: number; expected: number; status: string }>({ connected: false, count: 0, expected: 2, status: '' })
  const [code, setCode] = useState('')
  const [lobby, setLobby] = useState<Snapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('Connectez-vous à Chibasko sur ce site local.')
  useEffect(() => {
    const bridge = createLobbyGameSession((room, failed) => {
      let count = 0
      room?.state?.players?.forEach(() => count++)
      setGame({ connected: !!room, count, expected: room?.state?.expectedPlayers ?? 2, status: room?.state?.status ?? '' })
      if (failed) setMessage('Connexion GameRoom interrompue ou refusée.')
    })
    gameConnection.current = bridge
    let accountId: string | null = null
    const controller = createPlaygroundSession(async () => {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw new Error('Session unavailable')
      return data.session
    }, token => connectLobby(token, mode.current))
    connection.current = controller
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null
      if (!next || (accountId && accountId !== next)) {
        roomRef.current = null
        setLobby(null)
        bridge.close()
      }
      accountId = next
      controller.accountChanged(next)
    })
    return () => { roomRef.current = null; bridge.dispose(); gameConnection.current = null; controller.dispose(); connection.current = null; subscription.unsubscribe() }
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
        setLobby({ code: room.state.code, status: room.state.status, hostUserId: room.state.hostUserId, sessionId: room.sessionId, gameId: room.state.gameId, minPlayers: room.state.minPlayers, maxPlayers: room.state.maxPlayers, players })
      }
      room.onStateChange(refresh)
      room.onMessage('game_reservation', message => {
        if (roomRef.current === room) void gameConnection.current?.receive(message, room.state.gameId)
      })
      room.onMessage('game_cancelled', (message: { transitionId: string }) => {
        if (roomRef.current === room) gameConnection.current?.cancelled(message.transitionId)
      })
      room.onMessage('lobby_error', () => setMessage('Action refusée par le serveur.'))
      room.onError(() => setMessage('Connexion interrompue.'))
      room.onLeave(() => {
        if (roomRef.current !== room) return
        gameConnection.current?.close()
        roomRef.current = null; setLobby(null); setMessage('Lobby quitté ou connexion expirée.')
      })
      refresh(); setMessage('Lobby connecté.')
    } catch { setMessage('Connexion refusée : vérifiez le compte, le code et la disponibilité du lobby.') }
    finally { pending.current = false; setBusy(false) }
  }
  const self = lobby?.players.find(player => player.sessionId === lobby.sessionId)
  const host = !!self && self.userId === lobby?.hostUserId
  const canStart = lobby?.status === 'WAITING' && lobby.players.length >= lobby.minPlayers && lobby.players.length <= lobby.maxPlayers && lobby.players.every(player => player.ready)
  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-10">
    <h1 className="text-3xl font-bold">Lobby Chibasko local</h1>
    <p>Jeu de test : chibasko-pong (2 joueurs, sans gameplay)</p>
    <p role="status">{message}</p>
    {!lobby ? <div className="flex flex-wrap gap-3">
      <button disabled={busy} onClick={() => void join(true)}>Créer un lobby</button>
      <label>Code du lobby <input value={code} maxLength={12} onChange={event => setCode(event.target.value)} className="rounded border p-2" /></label>
      <button disabled={busy || !code.trim()} onClick={() => void join(false)}>Rejoindre</button>
    </div> : <>
      <p>Code : <strong>{lobby.code}</strong></p><p>Statut : <strong>{lobby.status}</strong></p>
      <p>Jeu : {lobby.gameId}</p>
      <p>Joueurs Lobby : {lobby.players.length} / {lobby.maxPlayers}</p>
      <p>GameRoom : {game.connected ? 'connecté' : 'déconnecté'} {game.status}</p>
      <p>Joueurs GameRoom : {game.count} / {game.expected}</p>
      <ul>{lobby.players.map(player => <li key={player.sessionId} className="my-2 rounded border p-3">
        {player.avatarUrl && <Image src={player.avatarUrl} alt="" width={40} height={40} />}
        <strong>{player.username}</strong> {player.userId === lobby.hostUserId && <span>HOST</span>} {player.sessionId === self?.sessionId && <span>(vous)</span>} — {player.ready ? 'Ready' : 'Not ready'}
      </li>)}</ul>
      <div className="flex gap-4">
        <button disabled={lobby.status !== 'WAITING'} onClick={() => roomRef.current?.send('set_ready', { ready: !self?.ready })}>{self?.ready ? 'Annuler Ready' : 'Ready'}</button>
        <button onClick={() => { roomRef.current = null; setLobby(null); gameConnection.current?.close(); connection.current?.disconnect() }}>Quitter</button>
        {host && <button disabled={!canStart} onClick={() => roomRef.current?.send('start_game')}>Start</button>}
      </div>
    </>}
  </main>
}

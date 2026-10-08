import { connectLobby, normalizeLobbyCode, type LobbyPlayer } from '../lobbyConnection'
import { createLobbyGameSession } from '../lobbyGameSession'
import { consumeGameReservation } from '../gameConnection'
import type { BridgeGameState } from '../lobbyGameSession'

export function gameServerOrigin(config = process.env.NEXT_PUBLIC_GAME_SERVER_URL, development = process.env.NODE_ENV === 'development') {
  const value = config || (development ? 'http://127.0.0.1:2567' : '')
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
    if (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) return null
    return url.origin
  } catch { return null }
}
export function multiplayerError(error: unknown): string {
  const key = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const messages: Record<string, string> = {
    'Code invalide': 'Le code de partie est invalide.', INVALID_CODE: 'Le code de partie est invalide.',
    AUTH_REQUIRED: 'Ta session a expiré. Reconnecte-toi à Chibasko Games.',
    LOBBY_NOT_FOUND: 'Cette partie est introuvable ou fermée.', WRONG_GAME: 'Cette partie appartient à un autre jeu.',
    LOBBY_FULL: 'Cette partie est complète.', LOBBY_STARTED: 'Cette partie a déjà démarré.',
    DUPLICATE_USER: 'Ton compte est déjà présent dans cette partie. Ferme l’autre connexion puis réessaie.',
    RATE_LIMIT: 'Trop de tentatives. Réessaie dans une minute.', TIMEOUT: 'La connexion a pris trop de temps. Réessaie.',
    HOST_REQUIRED: 'Seul l’hôte peut lancer la partie.', NOT_READY: 'Tous les joueurs doivent être prêts.',
    INVALID_STATE: 'Cette action n’est plus disponible.', CLOSED: 'La connexion à la partie a été interrompue. Tu peux réessayer.',
    UNAVAILABLE: 'Le multijoueur de Chibasko Games est temporairement indisponible.',
  }
  return messages[key] ?? 'Connexion impossible. Vérifie le code et la disponibilité du multijoueur de Chibasko Games.'
}
export type ProductGame = { slug: string; gameId: string }
export type PublicPlayer = Pick<LobbyPlayer, 'username' | 'avatarUrl' | 'ready'> & { host: boolean; self: boolean }
export type ProductLobby = ProductGame & { code: string; status: string; minPlayers: number; maxPlayers: number; players: PublicPlayer[] }
export type ProductSnapshot = { busy: boolean; error: string; lobby: ProductLobby | null; game: { connected: boolean; count: number; expected: number; status: string } }
export function isProductGameReady(state: ProductSnapshot) { return state.lobby?.status === 'PLAYING' && state.game.connected && state.game.status === 'READY' && state.game.count === state.game.expected }
type Session = { access_token: string; user: { id: string } }
export function createProductSession(options: {
  endpoint: string | null; getSession(): Promise<Session | null>
  catalogue(gameId: string): Promise<ProductGame | null>
  connect?: typeof connectLobby
}) {
  let state: ProductSnapshot = { busy: false, error: '', lobby: null, game: { connected: false, count: 0, expected: 0, status: '' } }
  const listeners = new Set<() => void>()
  const update = (patch: Partial<ProductSnapshot>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()) }
  let generation = 0, account: string | null = null
  let room: Awaited<ReturnType<typeof connectLobby>> | null = null
  let bridge: ReturnType<typeof createLobbyGameSession> | null = null
  let context: ProductGame | null = null
  let lastPath = ''
  const disconnect = (error = '') => {
    generation++; context = null
    bridge?.dispose(); bridge = null
    const previous = room; room = null
    if (previous) { previous.removeAllListeners(); void previous.leave().catch(() => {}) }
    update({ busy: false, error, lobby: null, game: { connected: false, count: 0, expected: 0, status: '' } })
  }
  async function connect(game: ProductGame | null, input?: string) {
    if (state.busy) return null
    disconnect(); context = game
    const attempt = generation
    update({ busy: true })
    try {
      if (!options.endpoint) throw new Error('UNAVAILABLE')
      const code = input === undefined ? undefined : normalizeLobbyCode(input)
      const session = await options.getSession()
      if (attempt !== generation) return null
      if (!session) throw new Error('AUTH_REQUIRED')
      if (account && account !== session.user.id) throw new Error('AUTH_REQUIRED')
      account = session.user.id
      if (!game) {
        if (!code) throw new Error('INVALID_CODE')
        const response = await fetch(new URL(`/lobbies/${code}`, options.endpoint), { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000) })
        const data: unknown = await response.json()
        if (!response.ok) throw new Error(data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'CONNECTION_REFUSED')
        if (!data || typeof data !== 'object' || !('gameId' in data) || typeof data.gameId !== 'string') throw new Error('LOBBY_NOT_FOUND')
        game = await options.catalogue(data.gameId)
        if (attempt !== generation) return null
        if (!game) throw new Error('LOBBY_NOT_FOUND')
        context = game
      }
      if (attempt !== generation) return null
      const target = game
      let timer: ReturnType<typeof setTimeout> | undefined
      const pending = (options.connect ?? connectLobby)(session.access_token, code, options.endpoint, target.gameId).then(async next => {
        if (attempt !== generation) { await next.leave().catch(() => {}); return null }
        return next
      })
      let next: Awaited<typeof pending>
      try { next = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('TIMEOUT')), 15000) })]) }
      finally { clearTimeout(timer) }
      if (!next || attempt !== generation) return null
      room = next
      bridge = createLobbyGameSession((gameRoom, failed) => {
        if (room !== next) return
        let count = 0; gameRoom?.state?.players?.forEach(() => count++)
        update({ game: { connected: !!gameRoom, count, expected: gameRoom?.state?.expectedPlayers ?? 0, status: gameRoom?.state?.status ?? '' }, ...(failed ? { error: 'La connexion à la partie a échoué. Tu peux réessayer depuis le lobby.' } : {}) })
      }, reservation => consumeGameReservation<BridgeGameState>(reservation, options.endpoint!))
      const refresh = () => {
        if (room !== next) return
        const players: PublicPlayer[] = []
        next.state.players.forEach((p, id) => players.push({ username: p.username, avatarUrl: p.avatarUrl, ready: p.ready, host: p.userId === next.state.hostUserId, self: id === next.sessionId }))
        update({ lobby: { ...target, code: next.state.code, status: next.state.status, minPlayers: next.state.minPlayers, maxPlayers: next.state.maxPlayers, players } })
      }
      next.onStateChange(refresh)
      next.onMessage('game_reservation', offer => { if (room === next) void bridge?.receive(offer, target.gameId) })
      next.onMessage('game_cancelled', (message: { transitionId: string }) => { if (room === next) { bridge?.cancelled(message.transitionId); update({ error: 'Le lancement a été annulé. Les joueurs peuvent se préparer à nouveau.' }) } })
      next.onMessage('lobby_error', (message: { code: string }) => { if (room === next) update({ error: multiplayerError(message.code) }) })
      next.onError(() => { if (room === next) disconnect(multiplayerError('CLOSED')) })
      next.onLeave(code => { if (room === next) disconnect(multiplayerError(code === 4001 ? 'AUTH_REQUIRED' : 'CLOSED')) })
      refresh(); update({ busy: false })
      return { ...target, code: next.state.code }
    } catch (error) {
      if (attempt === generation) disconnect(multiplayerError(error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : error))
      return null
    }
  }
  return {
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } },
    getSnapshot: () => state,
    connect,
    disconnect,
    accountChanged(id: string | null) { if (!id || (account && id !== account)) disconnect(); account = id },
    navigate(path: string) {
      const changed = lastPath && path !== lastPath
      lastPath = path
      if (changed && state.busy) { disconnect(); return }
      if (!context) return
      const base = `/games/${context.slug}`
      if (path !== base && path !== `${base}/lobby/${state.lobby?.code}`) disconnect()
    },
    ready(value: boolean) { update({ error: '' }); room?.send('set_ready', { ready: value }) },
    start() { update({ error: '' }); room?.send('start_game') },
  }
}

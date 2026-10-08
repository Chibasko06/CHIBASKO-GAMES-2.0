export const LOBBY_STATUS = { WAITING: 'WAITING', STARTING: 'STARTING', PLAYING: 'PLAYING', RESULTS: 'RESULTS', CLOSED: 'CLOSED' } as const
export type LobbyStatus = typeof LOBBY_STATUS[keyof typeof LOBBY_STATUS]
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 4
const transitions: Record<LobbyStatus, readonly LobbyStatus[]> = {
  WAITING: ['STARTING', 'CLOSED'], STARTING: ['WAITING', 'PLAYING', 'CLOSED'],
  PLAYING: ['WAITING', 'RESULTS', 'CLOSED'], RESULTS: ['CLOSED'], CLOSED: [],
}
export function canTransition(from: LobbyStatus, to: LobbyStatus) { return transitions[from].includes(to) }
export function rosterCanStart(players: readonly { ready: boolean; expiresAt: number }[], now: number, limits = { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS }) {
  return players.length >= limits.minPlayers && players.length <= limits.maxPlayers
    && players.every(player => player.ready && player.expiresAt > now)
}
export function readReady(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).length !== 1 || !('ready' in payload) || typeof payload.ready !== 'boolean') throw new Error('INVALID_PAYLOAD')
  return payload.ready
}

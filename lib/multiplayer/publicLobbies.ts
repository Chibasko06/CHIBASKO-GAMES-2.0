export type PublicLobbySummary = {
  code: string; gameId: string; host: { username: string; avatarUrl: string | null }
  currentPlayers: number; maxPlayers: number
}

// Project the response again at the browser boundary. Never retain extra fields.
export async function fetchPublicLobbies(endpoint: string, gameId: string, token: string, signal?: AbortSignal): Promise<PublicLobbySummary[]> {
  const url = new URL('/lobbies/public', endpoint)
  url.searchParams.set('gameId', gameId)
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, credentials: 'omit', redirect: 'error', cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = response.status === 401 ? 'AUTH_REQUIRED' : response.status === 429 ? 'RATE_LIMIT'
      : response.status === 403 ? 'ACCESS_UNSUPPORTED' : response.status === 404 ? 'UNKNOWN_GAME' : 'UNAVAILABLE'
    throw new Error(code)
  }
  if (!data || typeof data !== 'object' || !('lobbies' in data) || !Array.isArray(data.lobbies) || data.lobbies.length > 50) throw new Error('UNAVAILABLE')
  return data.lobbies.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('UNAVAILABLE')
    const row = entry as PublicLobbySummary
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(row.code) || row.gameId !== gameId || !row.host
      || typeof row.host.username !== 'string' || row.host.username.length > 200
      || (row.host.avatarUrl !== null && typeof row.host.avatarUrl !== 'string')
      || !Number.isInteger(row.currentPlayers) || !Number.isInteger(row.maxPlayers) || row.currentPlayers < 1 || row.currentPlayers >= row.maxPlayers) throw new Error('UNAVAILABLE')
    return { code: row.code, gameId, host: { username: row.host.username, avatarUrl: row.host.avatarUrl }, currentPlayers: row.currentPlayers, maxPlayers: row.maxPlayers }
  })
}

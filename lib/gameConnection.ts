import { Client } from '@colyseus/sdk'

export async function connectGameRoom<State>(token: string, method: 'create' | 'joinById' | 'joinOrCreate', target: string, endpoint = 'http://127.0.0.1:2567', options: Record<string, unknown> = {}) {
  const base = new URL(endpoint)
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
    || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))) {
    throw new Error('Invalid game server origin')
  }
  const response = await fetch(new URL(`/matchmake/${method}/${encodeURIComponent(target)}`, base), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(options), credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Connection refused')
  const reservation = await response.json()
  return consumeGameReservation<State>(reservation, base.origin)
}

export async function consumeGameReservation<State>(reservation: unknown, endpoint = 'http://127.0.0.1:2567') {
  const base = new URL(endpoint)
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
    || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))) throw new Error('Invalid game server origin')
  if (!reservation || typeof reservation !== 'object' || Array.isArray(reservation)) throw new Error('Invalid reservation')
  const seat = reservation as Record<string, unknown>
  if ('publicAddress' in seat || 'reconnectionToken' in seat) throw new Error('Unsafe connection URL')
  if (Object.keys(seat).some(key => !['name', 'roomId', 'processId', 'sessionId', 'devMode'].includes(key))) throw new Error('Invalid reservation')
  if (typeof seat.name !== 'string' || typeof seat.roomId !== 'string' || typeof seat.processId !== 'string' || typeof seat.sessionId !== 'string') throw new Error('Invalid reservation')
  for (const key of ['name', 'roomId', 'processId', 'sessionId']) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(seat[key] as string)) throw new Error('Invalid reservation')
  }
  const client = new Client(base.origin, {
    urlBuilder: url => {
      if (url.protocol !== (base.protocol === 'https:' ? 'wss:' : 'ws:') || url.host !== base.host
        || url.username || url.password || url.hash
        || [...url.searchParams.keys()].length !== 1 || !url.searchParams.has('sessionId')
        || url.searchParams.get('sessionId') !== seat.sessionId) throw new Error('Unsafe connection URL')
      return url.href
    },
  })
  // The SDK may restore its own persisted auth token. Never forward it to WebSocket.
  client.http.authToken = undefined
  const room = await client.consumeSeatReservation<State>(seat as unknown as Parameters<Client['consumeSeatReservation']>[0])
  room.reconnection.enabled = false
  return room
}

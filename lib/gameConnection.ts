import { Client } from '@colyseus/sdk'

export async function connectGameRoom<State>(token: string, method: 'create' | 'joinById' | 'joinOrCreate', target: string, endpoint = 'http://127.0.0.1:2567') {
  const base = new URL(endpoint)
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
    || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))) {
    throw new Error('Invalid game server origin')
  }
  const response = await fetch(new URL(`/matchmake/${method}/${encodeURIComponent(target)}`, base), {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Connection refused')
  const reservation = await response.json()
  if (reservation.error || typeof reservation.sessionId !== 'string' || typeof reservation.roomId !== 'string'
    || typeof reservation.processId !== 'string') throw new Error('Invalid reservation')
  const client = new Client(base.origin, {
    urlBuilder: url => {
      if (url.protocol !== (base.protocol === 'https:' ? 'wss:' : 'ws:') || url.host !== base.host
        || url.username || url.password || url.hash
        || [...url.searchParams.keys()].length !== 1 || !url.searchParams.has('sessionId')
        || url.searchParams.get('sessionId') !== reservation.sessionId) throw new Error('Unsafe connection URL')
      return url.href
    },
  })
  // The SDK may restore its own persisted auth token. Never forward it to WebSocket.
  client.http.authToken = undefined
  const room = await client.consumeSeatReservation<State>(reservation)
  room.reconnection.enabled = false
  return room
}

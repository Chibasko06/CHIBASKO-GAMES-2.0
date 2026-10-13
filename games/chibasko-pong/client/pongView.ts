export type PongView = {
  phase: string; remainingMs: number; width: number; height: number; paddleWidth: number; paddleHeight: number; inset: number; radius: number
  leftPaddleY: number; rightPaddleY: number; ballX: number; ballY: number; leftScore: number; rightScore: number
  leftName: string; rightName: string; selfSide: string
  leftAvatar?: string; rightAvatar?: string; winnerSide?: string; pointName?: string
}
export function readPongView(state: unknown, sessionId: string): PongView | null {
  if (!state || typeof state !== 'object') return null
  const s = state as Record<string, unknown>
  const fields = ['remainingMs', 'width', 'height', 'paddleWidth', 'paddleHeight', 'inset', 'radius', 'leftPaddleY', 'rightPaddleY', 'ballX', 'ballY', 'leftScore', 'rightScore'] as const
  if (typeof s.phase !== 'string' || fields.some(key => typeof s[key] !== 'number' || !Number.isFinite(s[key])) || (s.width as number) <= 0 || (s.height as number) <= 0) return null
  const players = s.players as { forEach(fn: (p: { side: string; username: string; avatarUrl?: string }, id: string) => void): void } | undefined
  if (!players?.forEach) return null
  let leftName = '', rightName = '', selfSide = '', leftAvatar = '', rightAvatar = ''
  players.forEach((p, id) => {
    if (p.side === 'LEFT') { leftName = p.username; leftAvatar = typeof p.avatarUrl === 'string' ? p.avatarUrl : '' }
    if (p.side === 'RIGHT') { rightName = p.username; rightAvatar = typeof p.avatarUrl === 'string' ? p.avatarUrl : '' }
    if (id === sessionId) selfSide = p.side
  })
  return { phase: s.phase, ...Object.fromEntries(fields.map(key => [key, s[key]])), leftName, rightName, selfSide,
    leftAvatar, rightAvatar, winnerSide: typeof s.winnerSide === 'string' ? s.winnerSide : '' } as PongView
}

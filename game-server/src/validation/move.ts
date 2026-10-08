export type Position = { x: number; y: number }
export type MoveRejection = 'invalid_payload' | 'out_of_bounds' | 'invalid_step' | 'rate_limited'

export function validateMove(payload: unknown, current: Position, now: number, previousAcceptedAt?: number): Position | MoveRejection {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'invalid_payload'
  const keys = Object.keys(payload)
  if (keys.length !== 2 || !keys.includes('x') || !keys.includes('y')) return 'invalid_payload'
  const { x, y } = payload as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)
    || !Number.isInteger(x) || !Number.isInteger(y)) return 'invalid_payload'
  if (x < 0 || x > 100 || y < 0 || y > 100) return 'out_of_bounds'
  if (Math.abs(x - current.x) + Math.abs(y - current.y) !== 1) return 'invalid_step'
  if (previousAcceptedAt !== undefined && now - previousAcceptedAt < 100) return 'rate_limited'
  return { x, y }
}

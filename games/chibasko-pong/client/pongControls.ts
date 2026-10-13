export type Direction = -1 | 0 | 1
export function createPongControls(send: (direction: Direction) => void) {
  const keys = new Set<string>(), pointers = new Map<number, Direction>()
  let sent: Direction = 0
  function update() {
    const up = keys.has('arrowup') || keys.has('w') || [...pointers.values()].includes(-1)
    const down = keys.has('arrowdown') || keys.has('s') || [...pointers.values()].includes(1)
    const direction = (Number(down) - Number(up)) as Direction
    if (direction !== sent) { sent = direction; send(direction) }
  }
  return {
    key(key: string, down: boolean) {
      key = key.toLowerCase()
      if (!['arrowup', 'arrowdown', 'w', 's'].includes(key)) return false
      if (down) keys.add(key); else keys.delete(key)
      update(); return true
    },
    press(pointerId: number, direction: Direction) { pointers.set(pointerId, direction); update() },
    release(pointerId: number) { if (pointers.delete(pointerId)) update() },
    reset() { keys.clear(); pointers.clear(); sent = 0; send(0) },
  }
}

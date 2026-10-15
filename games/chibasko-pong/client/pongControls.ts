export type Direction = -1 | 0 | 1
type KeyBindings = { up: readonly string[]; down: readonly string[] }
const onlineKeys: KeyBindings = { up: ['arrowup', 'w'], down: ['arrowdown', 's'] }
export const localLeftKeys: KeyBindings = { up: ['z', 'w'], down: ['s'] }
export function createPongControls(send: (direction: Direction) => void, bindings = onlineKeys) {
  const keys = new Set<string>(), pointers = new Map<number, Direction>()
  let sent: Direction = 0
  function update() {
    const up = bindings.up.some(key => keys.has(key)) || [...pointers.values()].includes(-1)
    const down = bindings.down.some(key => keys.has(key)) || [...pointers.values()].includes(1)
    const direction = (Number(down) - Number(up)) as Direction
    if (direction !== sent) { sent = direction; send(direction) }
  }
  return {
    key(key: string, down: boolean) {
      key = key.toLowerCase()
      if (!bindings.up.includes(key) && !bindings.down.includes(key)) return false
      if (down) keys.add(key); else keys.delete(key)
      update(); return true
    },
    press(pointerId: number, direction: Direction) { pointers.set(pointerId, direction); update() },
    release(pointerId: number) { if (pointers.delete(pointerId)) update() },
    reset() { keys.clear(); pointers.clear(); sent = 0; send(0) },
  }
}

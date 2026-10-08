export function scheduleSessionExpiry(expiresAt: number, expire: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const tick = () => {
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) { expire(); return }
    timer = setTimeout(tick, Math.min(remaining, 2147483647))
  }
  tick()
  return () => clearTimeout(timer)
}

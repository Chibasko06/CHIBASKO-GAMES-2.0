export const analyticsId = 'G-H10SZPPWWX'
export function privateLobbyPath(path: string) { return /^\/games\/[^/]+\/lobby\//.test(path) }

// Run before analytics' History API listeners, including for links and browser Back.
export function protectLobbyNavigation(target: Window) {
  const flag = `ga-disable-${analyticsId}`
  const disable = () => { (target as unknown as Record<string, unknown>)[flag] = true }
  const restore: (() => void)[] = []
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = target.history[method]
    const wrapped: History[typeof method] = function (data, unused, url) {
      const destination = url == null ? target.location.pathname : new URL(String(url), target.location.href).pathname
      if (privateLobbyPath(destination) || privateLobbyPath(target.location.pathname)) disable()
      return original.call(target.history, data, unused, url)
    }
    target.history[method] = wrapped
    restore.push(() => { if (target.history[method] === wrapped) target.history[method] = original })
  }
  const popped = () => { if (privateLobbyPath(target.location.pathname)) disable() }
  target.addEventListener('popstate', popped, true)
  return () => { restore.forEach(fn => fn()); target.removeEventListener('popstate', popped, true) }
}

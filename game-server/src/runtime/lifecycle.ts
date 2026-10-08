import { safeLog } from './logging.js'
import type { RuntimeState } from './requestPolicy.js'

export function createShutdown(state: RuntimeState, cleanup: () => Promise<void>, exit: (code: number) => void, timeoutMs = 20000) {
  let running: Promise<void> | undefined
  let exitCode = 0
  return (fatal = false, force = false): Promise<void> => {
    if (fatal) exitCode = 1
    if (running) { if (force) exit(1); return running }
    state.shuttingDown = true
    safeLog('server_shutdown_started')
    running = (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([cleanup(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('SHUTDOWN_TIMEOUT')), timeoutMs) })])
        safeLog('server_shutdown_completed')
      } catch { exitCode = 1; safeLog('cleanup_error') }
      finally { clearTimeout(timer); exit(exitCode) }
    })()
    return running
  }
}

import { fileURLToPath } from 'node:url'

// Exercise the real entrypoint even on Windows, where kill(SIGTERM) terminates
// immediately rather than delivering a POSIX signal. IPC simulates its dispatch.
const entry = new URL('../../src/index.ts', import.meta.url)
process.argv[1] = fileURLToPath(entry)
const info = console.info
console.info = (...args: unknown[]) => {
  info(...args)
  if (args.some(arg => typeof arg === 'string' && arg.includes('server_started'))) process.send?.('started')
}
process.on('message', message => {
  if (message === 'fatal') void Promise.reject(new Error('private_failure'))
  else process.emit('SIGTERM')
})
await import(entry.href)

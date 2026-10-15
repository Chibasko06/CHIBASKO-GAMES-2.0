import { spawnSync } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const compiler = resolve(dirname(fileURLToPath(import.meta.resolve('typescript'))), 'tsc.js')
const args = process.argv.slice(2), check = args.includes('--check')
const modes = args.filter(arg => arg !== '--check')
for (const mode of modes.length ? modes : ['shared', 'server', 'client']) {
  if (!['shared', 'server', 'client', 'runtime'].includes(mode)) throw new Error('Unknown build target')
  const result = spawnSync(process.execPath, [compiler, '-p', resolve(root, `tsconfig.${mode}.json`), ...(check ? ['--noEmit'] : [])], { cwd: root, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
  if (mode === 'client' && !check) {
    await mkdir(resolve(root, 'dist/client'), { recursive: true })
    await copyFile(resolve(root, 'client/pong.module.css'), resolve(root, 'dist/client/pong.module.css'))
  }
}

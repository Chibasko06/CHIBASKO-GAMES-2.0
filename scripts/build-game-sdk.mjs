import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const server = process.argv.includes('--server')
const consumer = server ? join(root, 'game-server') : root
const installed = await realpath(join(consumer, 'node_modules/@chibaskogames/sdk'))
const local = await realpath(join(root, 'packages/game-sdk')).catch(() => null)
const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
assert.equal(metadata.name, '@chibaskogames/sdk')
if (installed === local) {
  const require = createRequire(join(consumer, 'package.json'))
  const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', join(installed, server ? 'tsconfig.server.json' : 'tsconfig.json')], { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
} else {
  // A Git/tag or tarball dependency arrives already built. Never require its sources.
  for (const entry of ['.', './client', './server', ...(server ? [] : ['./react'])]) {
    for (const condition of ['types', 'default']) {
      const path = resolve(installed, metadata.exports[entry][condition])
      assert.ok(path.startsWith(installed + sep))
      await readFile(path)
    }
  }
  console.log('Using installed SDK ' + metadata.version + ' (prebuilt package).')
}

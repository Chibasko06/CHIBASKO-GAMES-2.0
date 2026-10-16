import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const server = process.argv.includes('--server')
const consumer = server ? join(root, 'game-server') : root
const installed = await realpath(join(consumer, 'node_modules/@chibaskogames/chibasko-pong'))
const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
assert.equal(metadata.name, '@chibaskogames/chibasko-pong')
assert.equal(metadata.version, '0.1.0')
for (const entry of server ? ['.', './server', './shared'] : ['.', './client', './local', './server', './shared']) {
  for (const condition of ['types', 'default']) {
    const target = resolve(installed, metadata.exports[entry][condition])
    assert.ok(target.startsWith(installed + sep))
    await readFile(target)
  }
}
if (!server) await readFile(join(installed, 'dist/client/pong.module.css'))
console.log('Using installed Pong ' + metadata.version + ' (public compiled exports).')

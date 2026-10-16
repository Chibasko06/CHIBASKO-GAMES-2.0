import assert from 'node:assert/strict'
import { readFile, realpath, lstat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const server = process.argv.includes('--server')
const consumer = server ? join(root, 'game-server') : root
const location = join(consumer, 'node_modules/@chibaskogames/chibasko-pong')
assert.equal((await lstat(location)).isSymbolicLink(), false, 'Pong must be installed from Git, not linked to local sources')
const installed = await realpath(location)
assert.equal(installed, location)
const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
assert.equal(metadata.name, '@chibaskogames/chibasko-pong')
assert.equal(metadata.version, '0.1.0')
const manifest = JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'))
const specification = 'git+https://github.com/Chibasko06/Chibasko-Pong.git#v0.1.0'
const release = lock.packages['node_modules/@chibaskogames/chibasko-pong']
assert.equal(manifest.dependencies[metadata.name], specification)
assert.equal(lock.packages[''].dependencies[metadata.name], specification)
assert.equal(release.link, undefined)
assert.equal(release.version, metadata.version)
assert.match(release.resolved, /^git\+(?:https:\/\/github\.com|ssh:\/\/git@github\.com)\/Chibasko06\/Chibasko-Pong\.git#07c23b83f6493e03113c43d1f56d21d15831c87b$/)
const fromGame = createRequire(join(installed, 'dist/server/index.js'))
assert.equal(await realpath(fromGame.resolve('@chibaskogames/sdk')), await realpath(join(consumer, 'node_modules/@chibaskogames/sdk/dist/index.js')), 'Pong must share its host SDK')
for (const entry of server ? ['.', './server', './shared'] : ['.', './client', './local', './server', './shared']) {
  for (const condition of ['types', 'default']) {
    const target = resolve(installed, metadata.exports[entry][condition])
    assert.ok(target.startsWith(installed + sep))
    await readFile(target)
  }
}
if (!server) await readFile(join(installed, 'dist/client/pong.module.css'))
console.log('Using Git Pong ' + metadata.version + ' at 07c23b83f6493e03113c43d1f56d21d15831c87b; public compiled exports and shared host SDK verified.')

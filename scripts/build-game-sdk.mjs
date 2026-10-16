import assert from 'node:assert/strict'
import { readFile, realpath } from 'node:fs/promises'
import { resolve, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const server = process.argv.includes('--server')
const consumer = server ? join(root, 'game-server') : root
const installed = await realpath(join(consumer, 'node_modules/@chibaskogames/sdk'))
const metadata = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(consumer, 'package.json'), 'utf8'))
const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'))
const dependency = lock.packages['node_modules/@chibaskogames/sdk']
assert.equal(metadata.name, '@chibaskogames/sdk')
assert.equal(dependency.link, undefined, 'SDK must be an installed package, not a local link')
assert.equal(metadata.version, dependency.version)
assert.equal(lock.packages[''].dependencies['@chibaskogames/sdk'], manifest.dependencies['@chibaskogames/sdk'])
assert.match(dependency.resolved, /^git\+(?:https:\/\/github\.com|ssh:\/\/git@github\.com)\/Chibasko06\/chibasko-games-sdk\.git#[a-f0-9]{40}$/)
// Historical command name retained for callers. Git prepare supplies the build;
// the platform verifies installed exports and never compiles SDK source.
for (const entry of ['.', './client', './server', ...(server ? [] : ['./react'])]) {
  for (const condition of ['types', 'default']) {
    const path = resolve(installed, metadata.exports[entry][condition])
    assert.ok(path.startsWith(installed + sep))
    await readFile(path)
  }
}
console.log('Using installed SDK ' + metadata.version + ' at ' + dependency.resolved.split('#')[1] + ' (Git package).')

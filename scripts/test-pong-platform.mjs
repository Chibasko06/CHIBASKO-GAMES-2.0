import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// Validate the actual installed Git packages. No substitution, source checkout,
// sibling directory, temporary dependency mutation or source build is needed.
const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const cache = join(root, 'node_modules/.cache')
await mkdir(cache, {recursive:true})
const fixture = await mkdtemp(join(cache, 'pong-git-proof-'))
function run(cwd, args) {
  const result = spawnSync(process.execPath, args, {cwd, stdio:'inherit', env:{...process.env}})
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Git Pong platform validation failed: ' + args.join(' '))
}
run(root, ['scripts/build-pong.mjs'])
run(root, ['scripts/build-pong.mjs', '--server'])
const resolution = []
for (const consumer of [root, join(root, 'game-server')]) {
  const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'))
  resolution.push(Object.fromEntries(['sdk','chibasko-pong'].map(name => {
    const pkg = lock.packages['node_modules/@chibaskogames/' + name]
    assert.equal(pkg.link, undefined)
    return [name, {version:pkg.version, resolved:pkg.resolved}]
  })))
}
assert.deepEqual(resolution[0], resolution[1])
// Reuse the integration suite, not Pong's internal gameplay/control unit tests.
run(root, ['scripts/test-sdk-platform.mjs'])
await writeFile(join(fixture, 'report.json'), JSON.stringify({resolution,
  result:'Actual Git Pong + SDK installations: TypeScript, web/product/local, backend/public/private/admission/network/results/replay, manifest, boundaries, Next and local Cloudflare builds passed.'}, null, 2))
console.log('Git Pong platform validation OK. Report:', join(fixture, 'report.json'))

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, realpath, rename, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// Validate the actual public npm installation, with any legacy local SDK unavailable.
// No dependency or node_modules replacement is performed by this proof.
const root = fileURLToPath(new URL('../', import.meta.url))
const cache = join(root, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const fixture = await mkdtemp(join(cache, 'sdk-npm-proof-'))
const npm = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env: { ...process.env,
    ...(process.platform === 'win32' ? { CHIBASKO_CLOUDFLARE: '1', NEXT_PRIVATE_STANDALONE: 'true' } : {}) } })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Public npm SDK validation failed: ' + args.join(' '))
}
const npmRun = (cwd, args) => run(cwd, [npm, ...args])
const resolution = []
for (const consumer of [root, join(root, 'game-server')]) {
  const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'))
  const sdk = lock.packages['node_modules/@chibaskogames/sdk']
  assert.equal(sdk.link, undefined)
  assert.equal(sdk.version, '0.3.0')
  assert.equal(sdk.resolved, 'https://registry.npmjs.org/@chibaskogames/sdk/-/sdk-0.3.0.tgz')
  const installed = await realpath(join(consumer, 'node_modules/@chibaskogames/sdk'))
  assert.equal(installed, join(consumer, 'node_modules/@chibaskogames/sdk'))
  resolution.push(sdk.resolved)
}
assert.equal(resolution[0], resolution[1])
const moved = []
try {
  // Windows may keep a package directory open. Hide the implementation, its
  // self-referencing tests and its build; retain restoration even on failure.
  for (const name of ['src', 'tests', 'dist', 'package.json']) {
    const original = join(root, 'packages/game-sdk', name), saved = join(fixture, 'legacy-sdk-' + name)
    try { await access(original) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    await rename(original, saved)
    moved.push({ original, saved })
  }
  npmRun(root, ['run', 'build:sdk'])
  npmRun(root, ['run', 'build:pong'])
  run(root, ['node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'])
  run(root, ['--import', './tests/register.mjs', '--test', 'tests/game-sdk.test.mjs', 'tests/product-session.test.mjs', 'tests/lobby-game-session.test.mjs'])
  run(root, ['--import', './tests/product-register.mjs', '--test', 'tests/multiplayer-product.test.mjs', 'tests/pong-local-product.test.mjs'])
  npmRun(root, ['run', 'check:game-manifest'])
  npmRun(root, ['run', 'check:game-boundaries'])
  npmRun(join(root, 'game-server'), ['run', 'build'])
  run(join(root, 'game-server'), ['--import', 'tsx', '--test', 'tests/auth.test.ts', 'tests/game-registry.test.ts', 'tests/game-session.test.ts', 'tests/internal-game-sdk.test.ts', 'tests/internal-game-module.test.ts', 'tests/lobby-game-bridge.test.ts', 'tests/pong-network.test.ts', 'tests/product-flow.test.ts', 'tests/public-lobbies.test.ts', 'tests/production.test.ts'])
  npmRun(root, ['run', 'build', '--', '--webpack'])
  // Reuse the fresh Cloudflare-compatible Next/standalone output, bundle only.
  npmRun(root, ['run', 'build:cloudflare', '--', '--skipNextBuild'])
  await writeFile(join(fixture, 'report.json'), JSON.stringify({ resolution, localSdkUnavailable: true,
    result: 'Public npm SDK installation: TypeScript, web/backend/network tests, manifest, boundaries, Next and local Cloudflare builds passed without local SDK implementation.' }, null, 2))
} finally {
  const errors = []
  for (const { original, saved } of moved.reverse()) {
    try { await rename(saved, original) } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'Legacy SDK restoration failed; inspect node_modules/.cache/sdk-npm-proof-*')
}
console.log('Public npm SDK platform validation OK; legacy SDK restored if present. Report:', join(fixture, 'report.json'))

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, realpath, lstat, rename, symlink, unlink } from 'node:fs/promises'
import { join, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// Controlled installation of a real tarball; dependency manifests stay local.
// Both node_modules links are restored even when a validation fails.
const root = fileURLToPath(new URL('../', import.meta.url))
const artifact = resolve(process.argv[2] ?? '')
assert.ok(artifact.endsWith('.tgz'), 'Pass the SDK tarball path as the first argument')
await readFile(artifact)
const cache = join(root, 'node_modules/.cache')
await mkdir(cache, { recursive: true })
const fixture = await mkdtemp(join(cache, 'sdk-package-proof-'))
assert.ok(fixture.startsWith(join(root, 'node_modules') + sep))
const npm = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit', env: { ...process.env,
    ...(process.platform === 'win32' ? { CHIBASKO_CLOUDFLARE: '1', NEXT_PRIVATE_STANDALONE: 'true' } : {}) } })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Packaged SDK platform validation failed: ' + args.join(' '))
}
const npmRun = (cwd, args) => run(cwd, [npm, ...args])
await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'sdk-platform-proof', private: true, type: 'module' }))
npmRun(fixture, ['install', '--offline', '--no-audit', '--no-fund', '--ignore-scripts', '--omit=peer', artifact])
const packaged = await realpath(join(fixture, 'node_modules/@chibaskogames/sdk'))
assert.equal(JSON.parse(await readFile(join(packaged, 'package.json'), 'utf8')).version, '0.1.0')
const restored = []
const moved = []
try {
  for (const consumer of [root, join(root, 'game-server')]) {
    const link = join(consumer, 'node_modules/@chibaskogames/sdk')
    assert.ok((await lstat(link)).isSymbolicLink(), 'Refuse to replace a non-link SDK installation')
    const original = await realpath(link), backup = link + '.local-backup-' + process.pid
    await rename(link, backup)
    restored.push({ link, backup, original })
    await symlink(packaged, link, process.platform === 'win32' ? 'junction' : 'dir')
  }
  // Prove that consumers cannot accidentally fall back to the SDK source tree.
  // Windows may keep the package directory open through existing npm junctions.
  // Move its source, tests and build instead; no fallback implementation remains.
  for (const name of ['src', 'tests', 'dist']) {
    const original = join(root, 'packages/game-sdk', name), saved = join(fixture, 'local-sdk-' + name)
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
  run(join(root, 'game-server'), ['--import', 'tsx', '--test', 'tests/internal-game-sdk.test.ts', 'tests/internal-game-module.test.ts', 'tests/pong-network.test.ts', 'tests/product-flow.test.ts', 'tests/public-lobbies.test.ts'])
  npmRun(root, ['run', 'build', '--', '--webpack'])
  await writeFile(join(fixture, 'report.json'), JSON.stringify({ artifact, packaged, result: 'Platform TypeScript, SDK/product/frontend tests, manifest, boundaries, backend build/network tests and Next build passed against installed SDK tarball.' }, null, 2))
} finally {
  const errors = []
  for (const { original, saved } of moved.reverse()) {
    try { await rename(saved, original) } catch (error) { errors.push(error) }
  }
  for (const { link, backup, original } of restored.reverse()) {
    try {
      const stat = await lstat(link).catch(error => { if (error.code !== 'ENOENT') throw error; return null })
      if (stat) { assert.ok(stat.isSymbolicLink(), 'Refuse to remove a non-link'); await unlink(link) }
      await rename(backup, link)
      assert.equal(await realpath(link), original)
    } catch (error) { errors.push(error) }
  }
  if (errors.length) throw new AggregateError(errors, 'SDK link restoration failed; inspect saved .local-backup links')
}
console.log('Packaged SDK platform proof OK; original local SDK links restored. Report:', join(fixture, 'report.json'))

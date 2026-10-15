import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const repository = fileURLToPath(new URL('../', import.meta.url))
const temporaryRoot = await realpath(tmpdir())
const scratch = await mkdtemp(join(temporaryRoot, 'chibasko-pong-extract-'))
const game = join(scratch, 'pong'), modules = join(scratch, 'node_modules')

async function dependencyDirectory(name) {
  let cursor = dirname(require.resolve(name))
  while (dirname(cursor) !== cursor) {
    try { if (JSON.parse(await readFile(join(cursor, 'package.json'), 'utf8')).name === name) return cursor } catch {}
    cursor = dirname(cursor)
  }
  throw new Error('Missing generic dependency ' + name)
}
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: game, stdio: 'inherit', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Standalone Pong command failed')
}
try {
  await cp(resolve(repository, 'games/chibasko-pong'), game, { recursive: true, filter: path => !['node_modules', 'dist'].includes(basename(path)) })
  await mkdir(join(modules, '@chibaskogames'), { recursive: true })
  async function provide(name) {
    const target = join(modules, name); await mkdir(dirname(target), { recursive: true })
    await symlink(await dependencyDirectory(name), target, process.platform === 'win32' ? 'junction' : 'dir')
  }
  await provide('typescript')
  run(['scripts/build.mjs', 'shared'])
  run(['--test', 'tests/engine.test.mjs'])
  // Pure engine has now built and passed its tests, before supplying SDK/schema/React.
  // Only the SDK's distributable contract is supplied; no platform source.
  const sdk = join(modules, '@chibaskogames/sdk')
  const installedSdk = await dependencyDirectory('@chibaskogames/sdk')
  await mkdir(sdk)
  await cp(join(installedSdk, 'package.json'), join(sdk, 'package.json'))
  await cp(join(installedSdk, 'dist'), join(sdk, 'dist'), { recursive: true })
  // Reuse explicitly declared generic dependencies already installed. No registry,
  // network access, app config, platform aliases or game-server source in this host.
  await provide('@colyseus/schema')
  run(['scripts/build.mjs', 'server'])
  run(['scripts/build.mjs', 'server', '--check'])
  // Server and engine have already built with no React/DOM host present.
  for (const name of ['react', 'react-dom', 'jsdom']) await provide(name)
  for (const name of ['react', 'react-dom']) {
    const target = join(modules, '@types', name); await mkdir(dirname(target), { recursive: true })
    await symlink(dirname(require.resolve(`@types/${name}/package.json`)), target, process.platform === 'win32' ? 'junction' : 'dir')
  }
  assert.equal((await readdir(scratch)).includes('app'), false)
  run(['scripts/build.mjs'])
  run(['scripts/build.mjs', '--check'])
  run(['--import', './tests/css-loader.mjs', '--test', ...((await readdir(join(game, 'tests'))).filter(file => file.endsWith('.test.mjs')).map(file => 'tests/' + file))])
  console.log('Extraction proof OK: copied source builds and tests outside the repository with only SDK + declared generic dependencies.')
} finally {
  // Never recursively remove a computed path without verifying its absolute scope.
  if (dirname(resolve(scratch)) !== temporaryRoot || !basename(scratch).startsWith('chibasko-pong-extract-')) throw new Error('Unsafe cleanup path')
  await rm(scratch, { recursive: true, force: true })
}

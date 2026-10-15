import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, writeFile, access, realpath } from 'node:fs/promises'
import { join, dirname, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repository = fileURLToPath(new URL('../', import.meta.url))
const scratch = await mkdtemp(join(await realpath(tmpdir()), 'chibasko-sdk-extract-'))
assert.ok(relative(repository, scratch).startsWith('..' + sep), 'Fixture must be outside the repository')
const sdk = join(scratch, 'sdk'), consumer = join(scratch, 'consumer'), pong = join(scratch, 'pong')
const npm = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
const sourceFiles = ['package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', '.gitignore', 'src', 'tests', 'tsconfig.json', 'tsconfig.server.json', 'tsconfig.test.json']
const installArgs = ['install', ...(process.argv.includes('--offline') ? ['--offline'] : []), '--no-audit', '--no-fund']
function run(cwd, command, args, capture = false) {
  console.log('>', cwd, command === process.execPath && args[0] === npm ? 'npm ' + args.slice(1).join(' ') : [command, ...args].join(' '))
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
  if (result.error) throw result.error
  if (result.status !== 0 && capture) console.error(result.stdout, result.stderr)
  assert.equal(result.status, 0, 'Isolated command failed')
  return result.stdout
}
const npmRun = (cwd, args, capture = false) => run(cwd, process.execPath, [npm, ...args], capture)
async function copySource(source, target) {
  await mkdir(target, { recursive: true })
  for (const name of sourceFiles) {
    const path = join(source, name)
    if (name === 'package-lock.json') { try { await access(path) } catch { continue } }
    await cp(path, join(target, name), { recursive: true })
  }
}
await copySource(join(repository, 'packages/game-sdk'), sdk)
console.log('Isolated SDK proof directory:', scratch)
npmRun(sdk, installArgs)
for (const script of ['build', 'typecheck', 'test']) npmRun(sdk, ['run', script])
const packedOutput = npmRun(sdk, ['pack', '--json'], true)
const packed = JSON.parse(packedOutput.slice(packedOutput.search(/\[\s*\{/)))[0]
const artifact = join(sdk, packed.filename)
const expected = ['package.json', 'README.md', 'CHANGELOG.md', ...['index', 'client/index', 'react/index', 'server/index'].flatMap(name => ['dist/' + name + '.js', 'dist/' + name + '.d.ts'])].sort()
assert.deepEqual(packed.files.map(file => file.path).sort(), expected)
const archivePaths = run(sdk, 'tar', ['-tzf', artifact], true).trim().split(/\r?\n/).sort()
assert.deepEqual(archivePaths, expected.map(path => 'package/' + path).sort())
console.log('Tarball content:', expected.join(', '))

await mkdir(consumer)
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'isolated-sdk-consumer', private: true, type: 'module', dependencies: { '@chibaskogames/sdk': 'file:' + artifact }, devDependencies: { typescript: '5.9.3' } }, null, 2))
npmRun(consumer, installArgs)
await assert.rejects(access(join(consumer, 'node_modules/react')))
await cp(join(sdk, 'tests/contracts.ts'), join(consumer, 'contracts.ts'))
await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: true, noEmit: true, types: [], lib: ['ES2022'] }, include: ['*.ts'] }))
await writeFile(join(consumer, 'smoke.mjs'), `import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { defineGame, INTEGRATION_VERSION } from '@chibaskogames/sdk'
import * as client from '@chibaskogames/sdk/client'
import * as server from '@chibaskogames/sdk/server'
assert.equal(INTEGRATION_VERSION, 1)
assert.equal(defineGame({ id: 'consumer', integrationVersion: 1, capabilities: { local: { players: { min: 1, max: 1 } } } }).id, 'consumer')
assert.deepEqual(Object.keys(client), [])
assert.deepEqual(Object.keys(server), [])
assert.throws(() => createRequire(import.meta.url).resolve('react'), { code: 'MODULE_NOT_FOUND' })
await assert.rejects(import('@chibaskogames/sdk/src/index.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
console.log('Root/client/server work without React or platform source.')
`)
run(consumer, process.execPath, ['smoke.mjs'])
run(consumer, process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'])

// Scan actual installed archive content, not just the source allowlist.
const sensitive = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|https?:\/\/(?:127\.0\.0\.1|localhost|[^\s/]+\.supabase\.co)/i
for (const path of expected) {
  const content = await readFile(join(consumer, 'node_modules/@chibaskogames/sdk', path), 'utf8')
  assert.doesNotMatch(content, sensitive, 'Potential sensitive content in ' + path)
  if (path.startsWith('dist/')) assert.doesNotMatch(content, /Supabase|LobbyRoom|GameSessionCoordinator|GameAdmission|colyseus|chibasko-pong|service_role|reservation|@\/|C:\\Users/i)
}

npmRun(consumer, [...installArgs, '--save-dev', 'react@19.2.4', 'react-dom@19.2.4', '@types/react@^19', '@types/react-dom@^19'])
await writeFile(join(consumer, 'react-smoke.mjs'), `import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { useChibaskoGame } from '@chibaskogames/sdk/react'
const connection = { localPlayerId: 'opaque', getSession: () => null, getState: () => ({ answer: 42 }), getRevision: () => 0, subscribe: () => () => {}, send() {} }
function Game() { return React.createElement('span', null, useChibaskoGame(connection).state.answer) }
assert.equal(renderToString(React.createElement(Game)), '<span>42</span>')
console.log('React entrypoint works from the installed tarball.')
`)
await writeFile(join(consumer, 'react-contract.ts'), `import { useChibaskoGame, type GameClientProps, type LocalGameProps } from '@chibaskogames/sdk/react'
export function game({ connection }: GameClientProps) { return useChibaskoGame(connection) }
export function local(props: LocalGameProps) { props.onExit() }
`)
run(consumer, process.execPath, ['react-smoke.mjs'])
run(consumer, process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'])

await cp(join(repository, 'games/chibasko-pong'), pong, { recursive: true, filter: path => !['node_modules', 'dist'].includes(path.split(/[\\/]/).at(-1)) })
npmRun(pong, [...installArgs, '--save-exact', artifact])
for (const script of ['build', 'typecheck', 'test']) npmRun(pong, ['run', script])
const report = { sdk, consumer, pong, artifact, integrity: packed.integrity, files: expected,
  result: 'SDK installed/built/typechecked/tested; four tarball entrypoints; no React needed by non-React entries; standalone Pong installed/built/typechecked/tested; sensitive content scan passed.' }
await writeFile(join(scratch, 'report.json'), JSON.stringify(report, null, 2))
console.log('SDK extraction proof OK. Evidence retained outside repository:', join(scratch, 'report.json'))

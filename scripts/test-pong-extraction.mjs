import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, writeFile, realpath, lstat, access } from 'node:fs/promises'
import { join, dirname, resolve, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { build } from 'esbuild'

const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const consumer = await mkdtemp(join(await realpath(tmpdir()), 'chibasko-pong-consumer-'))
assert.ok(relative(root, consumer).startsWith('..' + sep))
const npm = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { cwd: consumer, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' } })
  if (result.error) throw result.error
  if (result.status !== 0 && capture) console.error(result.stdout, result.stderr)
  assert.equal(result.status, 0, 'External Pong consumer failed: ' + args.join(' '))
  return result.stdout
}
const npmRun = args => run(process.execPath, [npm, ...args])
// Inspect the distribution actually installed from Git, not a sibling checkout.
const installed = join(root, 'node_modules/@chibaskogames/chibasko-pong')
assert.equal((await lstat(installed)).isSymbolicLink(), false)
const packDirectory = join(consumer, 'distribution')
await cp(installed, packDirectory, {recursive:true, filter:path => !['node_modules','.git'].includes(path.split(/[\\/]/).at(-1))})
const packedResult = spawnSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json'], {cwd:packDirectory, encoding:'utf8', env:{...process.env}})
if (packedResult.error) throw packedResult.error
assert.equal(packedResult.status, 0, 'Packing installed Pong failed')
const packed = JSON.parse(packedResult.stdout)[0]
const artifact = join(packDirectory, packed.filename)
const files = run('tar', ['-tzf', artifact], true).trim().split(/\r?\n/).sort()
for (const file of files) assert.match(file, /^package\/(?:package\.json|README\.md|CHANGELOG\.md|dist\/.+\.(?:js|d\.ts|css))$/)
await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'external-pong-consumer', private: true, type: 'module', dependencies: {
  '@chibaskogames/sdk': 'git+https://github.com/Chibasko06/chibasko-games-sdk.git#v0.1.0',
  '@chibaskogames/chibasko-pong': 'git+https://github.com/Chibasko06/Chibasko-Pong.git#v0.1.0',
}, devDependencies: { typescript: '5.9.3' } }, null, 2))
npmRun(['install', '--no-audit', '--no-fund'])
await assert.rejects(access(join(consumer, 'node_modules/react')))
await writeFile(join(consumer, 'server-smoke.mjs'), `import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pongDefinition } from '@chibaskogames/chibasko-pong'
import { pongServerModule } from '@chibaskogames/chibasko-pong/server'
import { PONG } from '@chibaskogames/chibasko-pong/shared'
assert.equal(pongDefinition, pongServerModule.definition)
assert.equal(PONG.width, 1000); assert.equal(PONG.height, 600)
assert.throws(() => createRequire(import.meta.url).resolve('react'), {code:'MODULE_NOT_FOUND'})
await assert.rejects(import('@chibaskogames/chibasko-pong/client/PongCanvas.js'), {code:'ERR_PACKAGE_PATH_NOT_EXPORTED'})
console.log('Root/server/shared work without React; private imports are rejected.')
`)
run(process.execPath, ['server-smoke.mjs'])
const lock = JSON.parse(await readFile(join(consumer, 'package-lock.json'), 'utf8'))
assert.equal(lock.packages['node_modules/@chibaskogames/sdk'].version, '0.1.0')
assert.ok(lock.packages['node_modules/@chibaskogames/sdk'].resolved.endsWith('#7bc73cc335e7dbd52b411a751fcc689969c5a5d4'))
assert.ok(lock.packages['node_modules/@chibaskogames/chibasko-pong'].resolved.endsWith('#07c23b83f6493e03113c43d1f56d21d15831c87b'))
npmRun(['install', '--save-dev', '--no-audit', '--no-fund', 'react@19.2.4', 'react-dom@19.2.4', '@types/react@^19', '@types/react-dom@^19', 'jsdom@29.1.1'])
await cp(join(root, 'tests/fixtures/pong-consumer'), join(consumer, 'fixture'), { recursive: true })
await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target:'ES2022', module:'NodeNext', moduleResolution:'NodeNext', strict:true, noEmit:true, skipLibCheck:true }, include:['fixture/*.ts'] }))
run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'])
run(process.execPath, ['--import', './fixture/css-loader.mjs', 'fixture/host.mjs'])
const browser = await build({ absWorkingDir:consumer, stdin:{ contents:"export { default as Online } from '@chibaskogames/chibasko-pong/client'; export { default as Local } from '@chibaskogames/chibasko-pong/local'", resolveDir:consumer }, bundle:true, platform:'browser', format:'esm', outdir:'bundle', write:false, metafile:true, loader:{'.css':'local-css'} })
const browserInputs = Object.keys(browser.metafile.inputs)
assert.ok(browserInputs.some(path => path.endsWith('/PongGame.js')))
assert.ok(browserInputs.some(path => path.endsWith('/PongLocalGame.js')))
assert.ok(browserInputs.some(path => path.endsWith('/pong.module.css')))
assert.equal(browserInputs.some(path => /@colyseus|\/server\/|supabase|\/app\//i.test(path)), false)
const sensitive = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}|\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}|\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}|https?:\/\/(?:127\.0\.0\.1|localhost|[^\s/]+\.supabase\.co)/i
for (const file of files) {
  const content = await readFile(join(consumer, 'node_modules/@chibaskogames/chibasko-pong', file.slice('package/'.length)), 'utf8')
  assert.doesNotMatch(content, sensitive, file)
  if (file.startsWith('package/dist/')) assert.doesNotMatch(content, /GameSessionCoordinator|GameAdmission|LobbyRoom|Supabase|service_role|@\/|C:\\Users|game-server\/src\/platform/i)
}
await writeFile(join(consumer, 'report.json'), JSON.stringify({ artifact, integrity:packed.integrity, files, sdk:lock.packages['node_modules/@chibaskogames/sdk'].resolved,
  pong:lock.packages['node_modules/@chibaskogames/chibasko-pong'].resolved, browserInputs, result:'Real Git installations of Pong and SDK: five public exports, TypeScript, external React host, server without React, browser/server isolation and packaged-content scan passed.' }, null, 2))
console.log('External Git Pong consumer OK. Evidence:', join(consumer, 'report.json'))

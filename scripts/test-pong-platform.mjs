import assert from 'node:assert/strict'
import { cp, mkdir, mkdtemp, readFile, writeFile, rename, readdir, lstat, realpath, access } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// Controlled substitution, restored even if a validation fails. No source
// compilation, junction to source, or private game import is used by the proof.
const root = resolve(fileURLToPath(new URL('../', import.meta.url)))
const artifact = resolve(process.argv[2] || join(root, '../chibasko-pong/chibaskogames-chibasko-pong-0.1.0.tgz'))
await access(artifact)
const cache = join(root, 'node_modules/.cache')
await mkdir(cache, {recursive:true})
const fixture = await mkdtemp(join(cache, 'pong-package-proof-'))
const npm = process.env.npm_execpath || join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
function run(cwd, args) {
  const result = spawnSync(process.execPath, args, { cwd, stdio:'inherit', env:{...process.env} })
  if (result.error) throw result.error
  assert.equal(result.status, 0, 'Packaged Pong platform validation failed')
}
await writeFile(join(fixture, 'package.json'), JSON.stringify({name:'pong-package-proof', private:true, dependencies:{
  '@chibaskogames/sdk':'git+https://github.com/Chibasko06/chibasko-games-sdk.git#v0.1.0',
  '@chibaskogames/chibasko-pong':'file:' + artifact,
}}, null, 2))
run(fixture, [npm, 'install', '--no-audit', '--no-fund'])
const installed = join(fixture, 'node_modules/@chibaskogames/chibasko-pong')
assert.equal((await lstat(installed)).isSymbolicLink(), false)
const manifests = [], replacements = [], hidden = []
try {
  for (const [index, consumer] of [root, join(root, 'game-server')].entries()) {
    const manifest = join(consumer, 'package.json'), original = await readFile(manifest)
    const metadata = JSON.parse(original)
    delete metadata.workspaces
    metadata.dependencies['@chibaskogames/chibasko-pong'] = 'file:' + artifact.replaceAll('\\', '/')
    manifests.push({manifest, original})
    await writeFile(manifest, JSON.stringify(metadata, null, 2) + '\n')
    const target = join(consumer, 'node_modules/@chibaskogames/chibasko-pong'), saved = join(fixture, 'original-install-' + index)
    await rename(target, saved)
    replacements.push({target, saved, used:join(fixture, 'tested-install-' + index)})
    // Real directories at each consumer reproduce npm's normal dependency
    // resolution: its own SDK/schema and the host's React, without duplicates.
    await cp(installed, target, {recursive:true})
    assert.equal((await lstat(target)).isSymbolicLink(), false)
    assert.equal(await realpath(target), target)
  }
  // Windows can retain directory handles (including legacy engine links).
  // Move files recursively, preserving empty directories only. No package.json,
  // source, test, build script or compiled file stays accessible at the old path.
  const source = join(root, 'games/chibasko-pong'), savedSource = join(fixture, 'source-unavailable')
  await mkdir(savedSource)
  async function hide(directory, backup) {
    await mkdir(backup, {recursive:true})
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const original = join(directory, entry.name), saved = join(backup, entry.name)
      if (entry.isDirectory()) await hide(original, saved)
      else { await rename(original, saved); hidden.push({original, saved}) }
    }
  }
  await hide(source, savedSource)
  async function assertEmpty(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      assert.ok(entry.isDirectory(), 'A local game file is still accessible')
      await assertEmpty(join(directory, entry.name))
    }
  }
  await assertEmpty(source)
  console.log('Local Pong workspace is unavailable. Validating installed tarball only.')
  run(root, ['scripts/test-sdk-platform.mjs'])
  await writeFile(join(fixture, 'report.json'), JSON.stringify({artifact, sourceUnavailable:true, normalInstalledPackages:true,
    result:'TypeScript, web integration, SDK, backend/admission/public-private/network/results/replay, manifest, boundaries, Next and local Cloudflare passed against the tarball without source.'}, null, 2))
} finally {
  const errors = []
  for (const {original, saved} of hidden.reverse()) try { await rename(saved, original) } catch (error) { errors.push(error) }
  for (const {target, saved, used} of replacements.reverse()) {
    try { try { await lstat(target); await rename(target, used) } catch (error) { if (error.code !== 'ENOENT') throw error }; await rename(saved, target) } catch (error) { errors.push(error) }
  }
  for (const {manifest, original} of manifests) try { await writeFile(manifest, original) } catch (error) { errors.push(error) }
  if (errors.length) throw new AggregateError(errors, 'Restoration failed; recovery files: ' + fixture)
}
console.log('Platform tarball proof OK; original manifests, installations and source restored. Report:', join(fixture, 'report.json'))

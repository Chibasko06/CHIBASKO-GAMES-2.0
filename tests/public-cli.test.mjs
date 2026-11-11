import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'

const exec = promisify(execFile)
const id = '11111111-1111-4111-8111-111111111111'
const manifest = mode => ({
  gameId: id, version: '1.0.0', schemaVersion: 1, integrationVersion: 1,
  ...(mode && { integration: { mode } }),
  capabilities: { local: { players: { min: 1, max: 1 } } },
  client: { entrypoints: { local: 'index.html' } },
})
async function fixture(dir, content, extras = {}) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false })
  if (content !== null) await writer.add('chibasko.json', new TextReader(content))
  await writer.add('index.html', new TextReader('<script>throw new Error("never execute")</script>'))
  for (const [name, body] of Object.entries(extras)) await writer.add(name, new TextReader(body))
  const path = join(dir, 'jeu avec espaces.zip')
  await writeFile(path, await writer.close())
  return path
}
test('le tarball installé hors dépôt réutilise le parseur de revue et fonctionne sans réseau', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chibasko-public-cli-'))
  const npm = process.env.npm_execpath
  assert.ok(npm, 'Exécuter avec npm run test:public-cli')
  try {
    const { stdout } = await exec(process.execPath, [npm, 'pack', resolve('tools/public-cli'), '--json', '--pack-destination', dir], { cwd: dir })
    const [pack] = JSON.parse(stdout)
    assert.deepEqual(pack.files.map(file => file.path).sort(),
      ['LICENSE', 'README.md', 'THIRD-PARTY-NOTICES.txt', 'dist/child.mjs', 'dist/cli.mjs', 'package.json'].sort())
    const tar = join(dir, pack.filename)
    await exec(process.execPath, [npm, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', tar], { cwd: dir })
    const run = async (archive, ...opts) => {
      const command = [npm, 'exec', '--offline', '--', 'chibasko', 'validate', archive, ...opts, '--json']
      try {
        const result = await exec(process.execPath, command, { cwd: dir })
        return { code: 0, body: JSON.parse(result.stdout) }
      } catch (error) {
        return { code: error.code, body: JSON.parse(error.stdout) }
      }
    }
    for (const mode of ['classic', 'sdk', undefined]) {
      const archive = await fixture(dir, JSON.stringify(manifest(mode)))
      const result = await run(archive)
      assert.equal(result.code, 0)
      assert.equal(result.body.integration, mode ?? 'sdk')
      assert.equal(result.body.warnings, 1)
      assert.equal((await run(archive, '--game', id, '--version', '1.0.0')).body.warnings, 0)
      assert.equal((await run(archive, '--game', id, '--version', '2.0.0')).body.diagnostics[0].code, 'UPLOAD_TARGET_MISMATCH')
      assert.equal((await run(archive, '--game', 'bad', '--version', '1.0.0')).body.diagnostics[0].code, 'INVALID_ARGUMENTS')
    }
    const invalid = async (archive, reason) => {
      const result = await run(archive)
      assert.equal(result.code, 1, JSON.stringify(result.body))
      assert.equal(result.body.errors, 1)
      assert.equal(result.body.diagnostics[0].code, reason)
      assert.ok(result.body.diagnostics[0].action)
    }
    await invalid(await fixture(dir, null), 'ROOT_MANIFEST_REQUIRED')
    await invalid(await fixture(dir, '{}'), 'INVALID_MANIFEST_SCHEMA')
    await invalid(await fixture(dir, '{'), 'INVALID_MANIFEST_JSON')
    await invalid(await fixture(dir, JSON.stringify(manifest('classic')), { _headers: 'fixture' }), 'FORBIDDEN_ARTIFACT_FILE')
    await invalid(await fixture(dir, JSON.stringify(manifest('classic')), { 'dir/../bad.txt': 'fixture' }), 'UNSAFE_ARTIFACT_PATH')
    await invalid(await fixture(dir, JSON.stringify(manifest('classic')), { 'bomb.txt': 'x'.repeat(100_000) }), 'ARCHIVE_RATIO_LIMIT')
    const corrupt = join(dir, 'corrupt.zip')
    await writeFile(corrupt, 'broken')
    await invalid(corrupt, 'ZIP_FORMAT_INVALID')
    await truncate(corrupt, 500 * 1024 ** 2 + 1)
    await invalid(corrupt, 'ARCHIVE_SIZE_LIMIT')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

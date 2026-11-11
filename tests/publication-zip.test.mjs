import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js'
import { inspectPublicationZip } from '../lib/game-distribution/publication-zip.ts'

const target = { gameId: '10000000-0000-4000-8000-000000000001', version: '1.0.0' }
const max = 32 * 1024 * 1024
const manifest = mode => ({
  ...target, schemaVersion: 1, integrationVersion: 1, ...(mode && { integration: { mode } }),
  capabilities: { local: { players: { min: 1, max: 1 } } },
  client: { entrypoints: { local: 'index.html' } },
})

async function zip(value, extra = {}, entry = true) {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false })
  if (value !== null) await writer.add('chibasko.json', new TextReader(JSON.stringify(value)), { level: 0 })
  if (entry) await writer.add('index.html', new TextReader('<script>throw Error("never executed")</script>'))
  for (const [name, contents] of Object.entries(extra)) await writer.add(name, new TextReader(contents))
  return writer.close()
}

test('classic, SDK et ancien manifeste implicite restent acceptés', async () => {
  for (const mode of ['classic', 'sdk', undefined]) {
    const result = await inspectPublicationZip(await zip(manifest(mode)), target, max, mode)
    assert.deepEqual(result, { manifest: manifest(mode), deferred: false })
  }
})

test('manifeste absent, incomplet, mauvais brouillon ou mode différent', async () => {
  await assert.rejects(inspectPublicationZip(await zip(null), target, max), /ROOT_MANIFEST_REQUIRED/)
  await assert.rejects(inspectPublicationZip(await zip({ gameId: target.gameId }), target, max),
    error => error.message === 'INVALID_MANIFEST_SCHEMA' && error.diagnosticLocation.field === '/schemaVersion')
  await assert.rejects(inspectPublicationZip(await zip({ ...manifest('classic'), version: '2.0.0' }), target, max), /UPLOAD_TARGET_MISMATCH/)
  await assert.rejects(inspectPublicationZip(await zip(manifest('sdk')), target, max, 'classic'), /INTEGRATION_MODE_MISMATCH/)
})

test('fichier interdit, chemin dangereux et entrée absente', async () => {
  await assert.rejects(inspectPublicationZip(await zip(manifest('classic'), { _headers: 'test' }), target, max),
    error => error.message === 'FORBIDDEN_ARTIFACT_FILE' && error.diagnosticLocation.path === '_headers')
  await assert.rejects(inspectPublicationZip(await zip(manifest('classic'), { 'a/../bad.txt': 'test' }), target, max), /UNSAFE_ARTIFACT_PATH/)
  await assert.rejects(inspectPublicationZip(await zip(manifest('classic'), {}, false), target, max), /ENTRYPOINT_MISSING/)
})

test('archive corrompue ou trop grande et budget local distinct des quotas de revue', async () => {
  await assert.rejects(inspectPublicationZip(new Blob(['broken']), target, max), /ZIP_FORMAT_INVALID/)
  await assert.rejects(inspectPublicationZip(await zip(manifest('classic')), target, 1), /ARCHIVE_SIZE_LIMIT/)
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false })
  for (let i = 0; i < 140; i++) await writer.add('asset-' + i, new TextReader('x'), { comment: 'a'.repeat(62_000) })
  const largeInventory = await writer.close()
  assert.deepEqual(await inspectPublicationZip(largeInventory, target, max), { manifest: null, deferred: true })
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createUploadService } from '../lib/game-distribution/uploads/service.ts'
import { developerBuildDetails, previewUnavailable } from '../lib/game-distribution/developer-build-preview.ts'
import { validationEvent } from '../lib/game-distribution/validation-diagnostics.ts'

const upload = '10000000-0000-4000-8000-000000000001'
const version = '10000000-0000-4000-8000-000000000002'
const summary = { technicalStatus: 'completed', versionStatus: 'draft', decision: 'pending', reason: null }
const snapshot = {
  ...summary, game: 'Fixture', gameId: upload, version: '1.0.0', gameVersionId: version,
  validatedAt: '2026-11-11T00:00:00Z', attempts: 2,
  review: { decision: 'pending', reason: null },
  manifest: { integration: { mode: 'classic' }, client: { entrypoints: { local: 'index.html' } } },
  history: [
    { action: 'integration_scan:{"attempt":1,"signals":true,"complete":true}' },
    { action: 'integration_scan:{"attempt":2,"signals":false,"complete":true}' },
    { action: 'internal-note' },
  ],
}

test('la fiche vérifie le droit sur cet upload avant de lire le snapshot et filtre les champs privés', async () => {
  const calls = []
  const service = createUploadService({ async call(name, args) {
    calls.push([name, args])
    if (name === 'distribution_developer_review') {
      if (args.p_actor !== 'owner') throw Error('upload_not_found')
      return summary
    }
    return { ...snapshot, developerProfile: { contactEmail: 'private@example.test' } }
  } }, {})
  await assert.rejects(service.review('stranger', upload), /upload_not_found/)
  assert.equal(calls.length, 1)
  const details = await service.review('owner', upload)
  assert.equal(details.previewVersionId, version)
  assert.deepEqual(details.scan, { signals: false, complete: true })
  assert.equal(details.attempt, 2)
  assert.ok(!JSON.stringify(details).includes('internal-note'))
  assert.ok(!JSON.stringify(details).includes('private@example.test'))
})

test('aucune prévisualisation pour un build en attente, invalide, retiré ou publié', () => {
  for (const technicalStatus of ['queued', 'validating', 'failed', 'expired']) {
    const details = developerBuildDetails({ ...summary, technicalStatus }, { ...snapshot, technicalStatus })
    assert.equal(details.previewVersionId, null)
    assert.match(previewUnavailable(details), /vérification technique/)
  }
  for (const versionStatus of ['published', 'archived', 'rejected']) {
    assert.equal(developerBuildDetails(summary, { ...snapshot, versionStatus }).previewVersionId, null)
  }
  assert.equal(developerBuildDetails(summary, { ...snapshot, review: { decision: 'pending', reason: 'Corriger' } }).previewVersionId, null)
})

test('un build exclusivement en ligne indique le besoin de session multijoueur', () => {
  const details = developerBuildDetails(summary, { ...snapshot, manifest: { client: { entrypoints: { online: 'index.html' } } } })
  assert.equal(details.previewVersionId, null)
  assert.match(previewUnavailable(details), /session multijoueur/)
})

test('une nouvelle tentative ou version ne récupère pas le diagnostic de la précédente', () => {
  const action = validationEvent(1, { version: 1, kind: 'submission', phase: 'extract',
    reason: 'FORBIDDEN_ARTIFACT_FILE', path: '_headers' })
  const failed = { ...snapshot, technicalStatus: 'failed', history: [{ action }], attempts: 1 }
  assert.equal(developerBuildDetails(summary, failed).diagnostic.path, '_headers')
  assert.equal(developerBuildDetails(summary, { ...failed, attempts: 2 }).diagnostic, null)
  const corrected = developerBuildDetails(summary, { ...snapshot, version: '1.0.1', gameVersionId: upload, history: [] })
  assert.equal(corrected.previewVersionId, upload)
  assert.equal(corrected.diagnostic, null)
  assert.equal(corrected.scan, null)
})

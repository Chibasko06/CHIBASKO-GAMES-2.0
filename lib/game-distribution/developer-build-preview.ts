import type { AdminBuild, ReviewSummary } from './review'
import { parseValidationEvent } from './validation-diagnostics'
import type { IntegrationMode } from './integration'

function scanSignal(action: string, attempt: number) {
  const prefix = 'integration_scan:'
  if (!action.startsWith(prefix) || action.length > 1024) return null
  try {
    const scan = JSON.parse(action.slice(prefix.length))
    return scan?.attempt === attempt && typeof scan.signals === 'boolean' && typeof scan.complete === 'boolean'
      ? { signals: scan.signals, complete: scan.complete } : null
  } catch { return null }
}

export function developerBuildDetails(summary: ReviewSummary, snapshot: AdminBuild) {
  const manifest = snapshot.manifest
  const mode = manifest ? (manifest.integration as { mode?: IntegrationMode } | undefined)?.mode ?? 'sdk' : null
  const entries = (manifest?.client as { entrypoints?: { local?: string } } | undefined)?.entrypoints
  const ready = summary.technicalStatus === 'completed' && snapshot.technicalStatus === 'completed'
    && ['draft', 'in_review', 'approved'].includes(snapshot.versionStatus ?? '')
    && !['rejected', 'archived'].includes(summary.decision)
    && !['rejected', 'archived'].includes(snapshot.review.decision)
    && !(snapshot.review.decision === 'pending' && snapshot.review.reason)
    && !!snapshot.validatedAt
  const events = (snapshot.history ?? []).map(({ action }) => parseValidationEvent(action))
  return {
    ...summary,
    technicalStatus: snapshot.technicalStatus,
    versionStatus: snapshot.versionStatus,
    decision: snapshot.review.decision,
    reason: snapshot.review.reason,
    gameId: snapshot.gameId,
    title: snapshot.game,
    version: snapshot.version,
    attempt: snapshot.attempts,
    mode,
    scan: snapshot.history.map(({ action }) => scanSignal(action, snapshot.attempts)).filter(Boolean).at(-1) ?? null,
    previewVersionId: ready && entries?.local ? snapshot.gameVersionId : null,
    onlineOnly: Boolean(ready && !entries?.local && manifest),
    diagnostic: events.filter(event => event?.attempt === snapshot.attempts).at(-1)?.diagnostic ?? null,
  }
}

export type DeveloperBuildDetails = ReturnType<typeof developerBuildDetails>

export function previewUnavailable(build: DeveloperBuildDetails) {
  if (build.onlineOnly) return 'Ce build nécessite une session multijoueur. Le test local du lecteur est indisponible.'
  if (build.versionStatus === 'published') return 'Cette version est publiée. Testez-la depuis sa fiche publique.'
  if (build.technicalStatus === 'failed' || build.technicalStatus === 'expired') return 'La vérification technique doit réussir avant de pouvoir lancer ce build.'
  if (['archived', 'rejected'].includes(build.decision)) return 'La décision de revue ferme la prévisualisation de ce build.'
  if (build.decision === 'pending' && build.reason) return 'Une correction est attendue. Consultez les résultats avant d’envoyer un nouveau build.'
  return 'Le build doit passer la vérification technique manuelle avant de pouvoir être prévisualisé.'
}

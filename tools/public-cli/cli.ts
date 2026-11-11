#!/usr/bin/env node
import { stat } from 'node:fs/promises'
import { inspectReviewArchive, UPLOAD_POLICY } from '../../services/build-validator/read-only-archive'
import { UUID } from '../../lib/game-distribution/uploads/policy'
import { isBuildVersion } from '../../lib/game-distribution/version'
import { describeValidation } from '../../lib/game-distribution/validation-diagnostics'
import { effectiveIntegration } from '../../lib/game-distribution/integration'

const usage = 'chibasko validate jeu.zip [--game UUID --version 1.0.0] [--json]'
type Message = { severity: 'error' | 'warning' | 'info' | 'review'; code: string; message: string; action?: string; path?: string; field?: string }
const messages: Message[] = []
const args = process.argv.slice(2)
const json = args.includes('--json')
let integration: string | null = null
let version: string | null = null
const controller = new AbortController()
function interrupt() { controller.abort() }
process.once('SIGINT', interrupt)
process.once('SIGTERM', interrupt)

try {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log(usage)
  } else {
    await validate()
    print()
  }
} finally {
  process.off('SIGINT', interrupt)
  process.off('SIGTERM', interrupt)
}

async function validate() {
  const [command, archive, ...options] = args
  const context = new Map<string, string>()
  for (let index = 0; index < options.length; index++) {
    const key = options[index]
    if (!['--game', '--version', '--json'].includes(key) || context.has(key)) return invalid()
    const value = key === '--json' ? 'yes' : options[++index]
    if (!value || value.startsWith('--')) return invalid()
    context.set(key, value)
  }
  const gameId = context.get('--game'), expectedVersion = context.get('--version')
  if (command !== 'validate' || !archive || archive.startsWith('--') || Boolean(gameId) !== Boolean(expectedVersion)
    || (gameId && (!UUID.test(gameId) || !isBuildVersion(expectedVersion)))) return invalid()
  let info
  try { info = await stat(archive) } catch {
    return error('ARCHIVE_UNREADABLE', 'Impossible de lire le fichier ZIP.', 'Vérifiez le nom du fichier et vos permissions.')
  }
  if (!info.isFile()) return error('ARCHIVE_UNREADABLE', 'Le chemin doit désigner un fichier ZIP.', 'Sélectionnez une archive ZIP.')
  if (info.size > UPLOAD_POLICY.maxArchiveBytes) {
    return error('ARCHIVE_SIZE_LIMIT', 'Archive supérieure à 500 Mio.', 'Réduisez la taille du build et reconstruisez le ZIP.')
  }
  try {
    const result = await inspectReviewArchive(archive, gameId && expectedVersion ? { gameId, version: expectedVersion } : null,
      UPLOAD_POLICY, AbortSignal.any([controller.signal, AbortSignal.timeout(UPLOAD_POLICY.validationMs + 60_000)]))
    if (result.diagnostic) {
      const detail = describeValidation(result.diagnostic)
      messages.push({ severity: 'error', code: detail.code, message: detail.explanation,
        action: detail.code === 'ROOT_MANIFEST_REQUIRED' ? 'Créez un brouillon sur /publier-un-jeu, téléchargez chibasko.json et placez-le à la racine du ZIP.' : detail.action,
        ...(detail.path && { path: detail.path }), ...(detail.field && { field: detail.field }) })
      return
    }
    const manifest = result.checkpoint?.manifest
    if (!manifest) return error('VALIDATOR_ERROR', 'Contrôle local interrompu.', 'Relancez la commande.')
    integration = effectiveIntegration(manifest)
    version = manifest.version
    messages.push({ severity: 'info', code: 'STRUCTURE_VALID', message: 'Structure ZIP conforme à la politique locale.' })
    if (!gameId) messages.push({ severity: 'warning', code: 'TARGET_NOT_CHECKED', message: 'Cohérence avec un brouillon non vérifiée.',
      action: 'Après création du brouillon, relancez avec --game et --version.' })
    messages.push({ severity: 'review', code: 'PLAYTEST_REQUIRED', message: 'Le chargement, le gameplay et le dialogue SDK éventuel restent à vérifier en revue.' })
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'inspection_disk_space_insufficient') {
      return error('LOCAL_SCRATCH_SPACE', 'Espace temporaire insuffisant.', 'Libérez de la place sur le volume temporaire.')
    }
    error('LOCAL_INSPECTION_FAILED', 'Contrôle local interrompu ou fichier indisponible.', 'Vérifiez les droits, l’espace temporaire et que l’archive reste inchangée pendant le contrôle.')
  }
}
function invalid() { error('INVALID_ARGUMENTS', 'Commande ou contexte invalide.', usage) }
function error(code: string, message: string, action: string) { messages.push({ severity: 'error', code, message, action }) }
function print() {
  const errors = messages.filter(item => item.severity === 'error').length
  const warnings = messages.filter(item => item.severity === 'warning').length
  process.exitCode = errors ? 1 : 0
  if (json) {
    console.log(JSON.stringify({ formatVersion: 1, policyRevision: UPLOAD_POLICY.revision, status: errors ? 'blocked' : 'valid',
      integration, version, errors, warnings, diagnostics: messages }))
    return
  }
  const labels = { error: 'Erreur bloquante', warning: 'Avertissement', info: 'Information', review: 'Réservé à la revue' }
  for (const item of messages) {
    console.log(labels[item.severity] + ' [' + item.code + '] ' + item.message)
    if (item.path || item.field) console.log('  ' + [item.path, item.field].filter(Boolean).join(' · '))
    if (item.action) console.log('  ' + item.action)
  }
  if (integration) console.log('Intégration ' + integration + ' · Version ' + version)
  console.log(errors + ' erreur(s), ' + warnings + ' avertissement(s).')
}

'use client'

import { useEffect, useId, useState } from 'react'
import { effectiveIntegration, type IntegrationMode } from '@/lib/game-distribution/integration'
import { validateManifest } from '@/lib/game-distribution/manifest'
import { VALIDATION_REASONS, type ValidationLocation, type ValidationReason } from '@/lib/game-distribution/validation-diagnostics'
import type { GameBuildManifest } from '@/lib/game-distribution/types'
import { FormFeedback } from './ui/FormFeedback'

function describe(error: unknown) {
  if (!(error instanceof Error)) return 'Archive illisible.'
  const location = (error as Error & { diagnosticLocation?: ValidationLocation }).diagnosticLocation
  const reason = 'code' in error ? String(error.code) : error.message
  const message = reason === 'INTEGRATION_MODE_MISMATCH'
    ? 'Le mode du manifeste diffère du mode choisi. Corrigez le ZIP ou changez votre choix.'
    : VALIDATION_REASONS[reason as ValidationReason] ?? 'Impossible de vérifier cette archive.'
  return [message, location?.path, location?.field].filter(Boolean).join(' · ')
}

type Result = { manifest: GameBuildManifest | null; deferred: boolean } | { error: string }

export function usePublicationZip(file: File | null, gameId: string, version: string, max: number) {
  const [mode, setMode] = useState<IntegrationMode>()
  const [check, setCheck] = useState<{ file: File; gameId: string; version: string; max: number; mode?: IntegrationMode; result: Result }>()
  useEffect(() => {
    if (!file || !gameId || !version || !max) return
    const abort = new AbortController()
    let active = true
    void import('@/lib/game-distribution/publication-zip')
      .then(({ inspectPublicationZip }) => inspectPublicationZip(file, { gameId, version }, max, mode, abort.signal))
      .then(save, error => save({ error: describe(error) }))
    function save(result: Result) {
      if (active && file) setCheck({ file, gameId, version, max, mode, result })
    }
    return () => { active = false; abort.abort() }
  }, [file, gameId, version, max, mode])
  const result = check && check.file === file && check.gameId === gameId && check.version === version
    && check.max === max && check.mode === mode ? check.result : undefined
  return { mode, setMode, result, checking: Boolean(file && gameId && version && max && !result),
    canUpload: Boolean(result && !('error' in result)) }
}

const input = 'mt-1 block w-full rounded border border-zinc-700 bg-zinc-950 p-2'

export default function PublicationManifest({ gameId, version, zip, busy }: {
  gameId: string; version: string; zip: ReturnType<typeof usePublicationZip>; busy: boolean
}) {
  const id = useId()
  const manifest = zip.result && 'manifest' in zip.result ? zip.result.manifest : null
  const selected = zip.mode ?? (manifest ? effectiveIntegration(manifest) : undefined)
  return <section className="space-y-3 rounded-lg border border-zinc-700 p-4" aria-label="Préparation du build">
    <fieldset disabled={busy} className="space-y-2">
      <legend className="font-semibold">Type d’intégration</legend>
      <label className="block"><input type="radio" name={id} checked={selected === 'classic'} onChange={() => zip.setMode('classic')}/> Jeu HTML5 classique</label>
      <p className="text-sm text-zinc-300">Pour un jeu autonome. Le SDK est facultatif et les services intégrés ne sont pas activés.</p>
      <label className="block"><input type="radio" name={id} checked={selected === 'sdk'} onChange={() => zip.setMode('sdk')}/> Jeu utilisant le SDK Chibasko Games</label>
      <p className="text-sm text-zinc-300">Pour un jeu solo ou multijoueur qui communique avec le lecteur. Les capacités déclarées sont vérifiées en revue.</p>
      {!zip.mode && <p className="text-sm text-zinc-300">Si vous avez déjà un ZIP, son manifeste indique le mode. Les anciens manifestes sans mode restent interprétés comme SDK.</p>}
    </fieldset>
    <details>
      <summary className="cursor-pointer text-cyan-200">Préparer chibasko.json</summary>
      <ManifestGenerator key={gameId + ':' + JSON.stringify(manifest)} gameId={gameId} version={version}
        mode={selected ?? 'classic'} manifest={manifest} busy={busy}/>
    </details>
    {zip.checking && <p role="status">Vérification du ZIP…</p>}
    {zip.result && ('error' in zip.result
      ? <FormFeedback tone="error" title="ZIP à corriger"><p>{zip.result.error}</p><p>Corrigez le build puis sélectionnez son nouveau ZIP.</p></FormFeedback>
      : zip.result.deferred
        ? <FormFeedback tone="warning" title="Contrôle local partiel"><p>L’inventaire dépasse le budget du navigateur. La revue vérifiera l’archive.</p></FormFeedback>
        : <FormFeedback tone="success" title="Précontrôle réussi"><p>Manifeste lu pour {manifest?.version} · {selected === 'sdk' ? 'SDK' : 'HTML5 classique'}.</p>
          <p>Entrées déclarées : {Object.values(manifest?.client.entrypoints ?? {}).join(', ')}.</p></FormFeedback>)}
    <p className="text-sm text-zinc-300">La revue vérifiera l’extraction complète, le chargement et, le cas échéant, la communication avec le SDK.</p>
  </section>
}

function ManifestGenerator({ gameId, version, mode, manifest, busy }: {
  gameId: string; version: string; mode: IntegrationMode; manifest: GameBuildManifest | null; busy: boolean
}) {
  const [local, setLocal] = useState(Boolean(manifest?.capabilities.local ?? !manifest))
  const [online, setOnline] = useState(Boolean(manifest?.capabilities.online))
  const [localEntry, setLocalEntry] = useState(manifest?.client.entrypoints.local ?? 'index.html')
  const [onlineEntry, setOnlineEntry] = useState(manifest?.client.entrypoints.online ?? 'index.html')
  const [localMin, setLocalMin] = useState(String(manifest?.capabilities.local?.players.min ?? 1))
  const [localMax, setLocalMax] = useState(String(manifest?.capabilities.local?.players.max ?? 1))
  const [onlineMin, setOnlineMin] = useState(String(manifest?.capabilities.online?.players.min ?? 2))
  const [onlineMax, setOnlineMax] = useState(String(manifest?.capabilities.online?.players.max ?? 2))
  const [publicAccess, setPublicAccess] = useState(manifest?.capabilities.online?.access.includes('public') ?? false)
  const [privateAccess, setPrivateAccess] = useState(manifest?.capabilities.online?.access.includes('private') ?? true)
  const [isolated, setIsolated] = useState(manifest?.client.requirements?.crossOriginIsolation ?? false)
  const [error, setError] = useState('')
  const includeLocal = mode === 'classic' || local
  const includeOnline = mode === 'sdk' && online
  function download() {
    try {
      const value = validateManifest({
        schemaVersion: 1, integrationVersion: 1, gameId, version,
        integration: { mode, ...(mode === 'sdk' && manifest?.integration?.sdkVersion ? { sdkVersion: manifest.integration.sdkVersion } : {}) },
        capabilities: {
          ...(includeLocal && { local: { players: { min: Number(localMin), max: Number(localMax) } } }),
          ...(includeOnline && { online: { players: { min: Number(onlineMin), max: Number(onlineMax) },
            access: [...(publicAccess ? ['public'] : []), ...(privateAccess ? ['private'] : [])] } }),
        },
        client: { entrypoints: { ...(includeLocal && { local: localEntry }), ...(includeOnline && { online: onlineEntry }) },
          ...(isolated && { requirements: { crossOriginIsolation: true } }) },
      }, { gameId, version })
      const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'chibasko.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setError('')
    } catch (cause) { setError(describe(cause)) }
  }
  return <fieldset disabled={busy} className="mt-3 space-y-3">
    <p className="break-all text-sm">Jeu {gameId} · Version {version || 'à renseigner dans le formulaire'} · {mode === 'sdk' ? 'SDK' : 'HTML5 classique'}</p>
    {mode === 'sdk' && <label className="block"><input type="checkbox" checked={local} onChange={e => setLocal(e.target.checked)}/> Exécution locale</label>}
    {includeLocal && <>
      <label className="block">Page HTML locale<input className={input} value={localEntry} maxLength={512} onChange={e => setLocalEntry(e.target.value)}/></label>
      <div className="grid grid-cols-2 gap-2">
        <label>Joueurs locaux minimum<input className={input} inputMode="numeric" value={localMin} onChange={e => setLocalMin(e.target.value)}/></label>
        <label>Joueurs locaux maximum<input className={input} inputMode="numeric" value={localMax} onChange={e => setLocalMax(e.target.value)}/></label>
      </div>
    </>}
    {mode === 'sdk' && <label className="block"><input type="checkbox" checked={online} onChange={e => setOnline(e.target.checked)}/> Multijoueur avec admission Chibasko Games</label>}
    {includeOnline && <>
      <label className="block">Page HTML en ligne<input className={input} value={onlineEntry} maxLength={512} onChange={e => setOnlineEntry(e.target.value)}/></label>
      <div className="grid grid-cols-2 gap-2">
        <label>Joueurs en ligne minimum<input className={input} inputMode="numeric" value={onlineMin} onChange={e => setOnlineMin(e.target.value)}/></label>
        <label>Joueurs en ligne maximum<input className={input} inputMode="numeric" value={onlineMax} onChange={e => setOnlineMax(e.target.value)}/></label>
      </div>
      <label className="block"><input type="checkbox" checked={publicAccess} onChange={e => setPublicAccess(e.target.checked)}/> Parties publiques</label>
      <label className="block"><input type="checkbox" checked={privateAccess} onChange={e => setPrivateAccess(e.target.checked)}/> Parties privées</label>
    </>}
    <label className="block"><input type="checkbox" checked={isolated} onChange={e => setIsolated(e.target.checked)}/> Le build exige l’isolation interorigine (par exemple pour SharedArrayBuffer)</label>
    <button type="button" className="rounded border border-cyan-700 px-3 py-2" onClick={download}>Télécharger chibasko.json</button>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <p className="text-sm text-zinc-300">Placez le fichier à la racine du ZIP, puis sélectionnez l’archive reconstruite. Le téléchargement ne modifie pas le ZIP sélectionné ou envoyé.</p>
  </fieldset>
}

'use client'

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { httpLaunchClient } from '@/lib/game-runtime/client'
import type { RuntimeState } from '@/lib/game-runtime/contracts'
import type { DeveloperBuildDetails } from '@/lib/game-distribution/developer-build-preview'
import PreviewManualChecks from './PreviewManualChecks'

const GameRuntime = dynamic(() => import('./GameRuntime'), { ssr: false })

const errors: Record<string, string> = {
  launch_unavailable: 'Le portail n’a pas pu ouvrir la session de prévisualisation.',
  descriptor_timeout: 'La demande de session a dépassé le délai prévu.',
  iframe_load_timeout: 'Le lecteur n’a reçu aucun événement de chargement dans le délai prévu.',
  iframe_error: 'Le navigateur a signalé une erreur de chargement de l’iframe.',
  hello_timeout: 'Le lecteur n’a reçu aucune ouverture de dialogue SDK valide.',
  handshake_timeout: 'Le dialogue SDK n’a pas terminé son échange initial.',
  game_ready_timeout: 'Le lecteur n’a pas reçu la confirmation que le SDK était prêt.',
  launch_expired: 'La session de jeu a expiré.',
  unexpected_navigation: 'Le lecteur a interrompu une navigation inattendue dans l’iframe.',
}

export default function DeveloperBuildPreview({ build, token }: { build: DeveloperBuildDetails; token: string }) {
  const [active, setActive] = useState(false)
  const [state, setState] = useState<RuntimeState>()
  const [observation, setObservation] = useState<{ mode: 'classic' | 'sdk'; protocol: number | null }>()
  const client = useMemo(() => httpLaunchClient(async () => token), [token])
  const versionId = build.previewVersionId
  if (!versionId) return null

  const failed = state?.phase === 'failed'
  return <section className="space-y-4 rounded-lg border border-zinc-700 p-4">
    <h2 className="text-xl font-semibold">Prévisualisation privée</h2>
    <button type="button" className="rounded border border-cyan-700 px-3 py-2" onClick={() => {
      if (!active) { setState(undefined); setObservation(undefined) }
      setActive(!active)
    }}>{active ? 'Fermer la prévisualisation' : 'Lancer la prévisualisation'}</button>
    {active && <GameRuntime gameId={build.gameId} gameVersionId={versionId} execution="local" audience="preview"
      locale="fr" client={client} onLeave={() => setActive(false)}
      onRuntimeState={value => {
        setState(value)
        if (value.phase === 'resolving') setObservation(undefined)
      }}
      onIntegration={({ mode, protocol }) => setObservation({ mode, protocol })}/>}
    <div role="status" className="space-y-1 text-sm">
      {failed && <p>Échec observé · {errors[state.error ?? ''] ?? 'Le lecteur a interrompu le lancement.'}</p>}
      <p>{observation?.mode === 'classic' ? 'Événement de chargement de l’iframe reçu. Le contenu affiché reste à vérifier.'
        : observation?.mode === 'sdk' ? 'Chargement et initialisation confirmés par le dialogue SDK.'
          : active && !failed ? 'Lancement en cours.' : 'Chargement initial non vérifié.'}</p>
      {build.mode === 'sdk' && <p>{observation?.mode === 'sdk'
        ? 'Dialogue observé · SDK prêt · protocole ' + observation.protocol
        : 'Initialisation SDK non confirmée.'}</p>}
      <p>Ressources internes · vérification manuelle nécessaire. Le lecteur parent ne voit pas les réponses réseau à l’intérieur de l’iframe.</p>
    </div>
    <PreviewManualChecks/>
  </section>
}

import type { GameCapabilities } from '@chibaskogames/sdk'

export const privateGameLaunch = {
  kind: 'private', label: 'Partie privée',
  description: 'Crée une partie privée ou rejoins-en une avec un code.',
} as const
type LaunchOption = { kind: 'public' | 'private' | 'local'; label: string; description?: string }

// Presentation only. Declaring public access does not implement a public-room flow.
export function gameLaunchOptions(capabilities: GameCapabilities | undefined): LaunchOption[] {
  const options: LaunchOption[] = []
  if (capabilities?.online?.access.includes('public')) options.push({ kind: 'public', label: 'Jouer en ligne' })
  if (capabilities?.online?.access.includes('private')) options.push(privateGameLaunch)
  if (capabilities?.local) options.push({ kind: 'local', label: 'Jouer en local', description: 'Joue à deux sur le même appareil.' })
  return options
}

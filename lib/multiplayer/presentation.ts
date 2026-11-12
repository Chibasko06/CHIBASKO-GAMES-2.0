import type {GameCapabilities} from '@chibaskogames/sdk'

export type OnlineAccess = 'public'|'private'
export type MultiplayerPresentation = {
  active_version_id?:string|null
  runtime_capabilities?:GameCapabilities|null
  availableOnline?:readonly OnlineAccess[]
}

export function hasAvailableMultiplayer(game:MultiplayerPresentation) {
  const online=game.runtime_capabilities?.online
  return Boolean(game.active_version_id&&online?.access.some(access=>game.availableOnline?.includes(access)))
}

import type { GameDefinition as SdkGameDefinition } from '@chibaskogames/sdk'
// Private installed registration. Flat capacities are a derived compatibility view
// for the existing lobby/coordinator, never a second editable definition.
export type ServerGameRegistration = Readonly<{
  id: string
  roomType: string
  minPlayers: number
  maxPlayers: number
  definition: SdkGameDefinition
}>
export type GameDefinition = ServerGameRegistration
export type GameRegistry = ReadonlyMap<string, GameDefinition>
export function serverGameRegistration(definition: SdkGameDefinition, roomType: string): ServerGameRegistration {
  const online = definition.capabilities.online
  if (!online || !online.access.length) throw new Error('UNSUPPORTED_INSTALLATION')
  return Object.freeze({ definition, id: definition.id, roomType, minPlayers: online.players.min, maxPlayers: online.players.max })
}

// Transport/framework-independent integration contract. Never import platform code.
export const INTEGRATION_VERSION = 1 as const
export type IntegrationVersion = typeof INTEGRATION_VERSION
export type PlayerCapacity = Readonly<{ min: number; max: number }>
export type GameCapabilities = Readonly<{
  online?: Readonly<{ access: readonly ('public' | 'private')[]; players: PlayerCapacity }>
  local?: Readonly<{ players: PlayerCapacity }>
}>
export type GameDefinition = Readonly<{ id: string; integrationVersion: IntegrationVersion; capabilities: GameCapabilities }>
export type GameParticipant = Readonly<{ participantId: string; username: string; avatarUrl: string | null }>
export type GameSessionDescriptor = Readonly<{ id: string; gameId: string; integrationVersion: IntegrationVersion; execution: 'online' | 'local' }>
export type GameSessionSnapshot = Readonly<{
  session: GameSessionDescriptor; participants: readonly GameParticipant[]
  localParticipantIds: readonly string[]; connectedParticipantIds: readonly string[]
  availability: 'preparing' | 'ready' | 'completed'
}>
export type GameResult = Readonly<{
  gameId: string; winnerParticipantId: string | null; reason: string
  players: readonly Readonly<{ participantId: string; score?: number }>[]
}>
export function defineGame(definition: GameDefinition): GameDefinition {
  const { capabilities: c } = definition
  const capacity = (p: PlayerCapacity) => Number.isInteger(p.min) && p.min > 0 && Number.isInteger(p.max) && p.max >= p.min
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id) || definition.integrationVersion !== INTEGRATION_VERSION
    || !c || (!c.online && !c.local) || (c.online && (!capacity(c.online.players) || !c.online.access.length
      || c.online.access.some(a => a !== 'public' && a !== 'private') || new Set(c.online.access).size !== c.online.access.length))
    || (c.local && !capacity(c.local.players))) throw new Error('INVALID_GAME_DEFINITION')
  return Object.freeze({ id: definition.id, integrationVersion: INTEGRATION_VERSION, capabilities: Object.freeze({
    ...(c.online ? { online: Object.freeze({ access: Object.freeze([...c.online.access]), players: Object.freeze({ ...c.online.players }) }) } : {}),
    ...(c.local ? { local: Object.freeze({ players: Object.freeze({ ...c.local.players }) }) } : {}),
  }) })
}

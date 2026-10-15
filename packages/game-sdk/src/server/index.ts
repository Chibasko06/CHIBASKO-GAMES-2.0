import type { GameDefinition, GameParticipant, GameResult, GameSessionDescriptor } from '../index.js'
export type { GameDefinition, GameParticipant, GameResult } from '../index.js'
export type GameServerSession = Readonly<{
  session: GameSessionDescriptor
  participants: readonly GameParticipant[]
  isParticipantActive(participantId: string): boolean
  complete(result: GameResult): boolean
  fail(): void
}>
export type GameMessagePeer = Readonly<{ participant: GameParticipant; reply(type: string, payload?: unknown): void }>
export type GameServerInstance<State> = {
  state: State
  participantJoined(participant: GameParticipant): void
  participantLeft(participantId: string): void
  receive(peer: GameMessagePeer, type: string, payload: unknown): void
  start(): void
  tick(deltaMs: number): void
  dispose(): void
}
export type GameServerModule<State> = Readonly<{ definition: GameDefinition; tickRate: number; patchRateMs: number; create(session: GameServerSession): GameServerInstance<State> }>

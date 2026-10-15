import type { GameResult as SdkGameResult } from '@chibaskogames/sdk'
// Private lobby projection of the SDK result. Supabase user IDs stay inside the
// platform; games complete with opaque session participant IDs instead.
export type GameResult = Readonly<Omit<SdkGameResult, 'winnerParticipantId' | 'players'> & {
  winnerUserId: string | null
  players: readonly Readonly<{ userId: string; score?: number }>[]
}>

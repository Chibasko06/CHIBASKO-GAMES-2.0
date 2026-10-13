export type GameResult = Readonly<{
  gameId: string; winnerUserId: string | null; reason: string
  players: readonly Readonly<{ userId: string; score?: number }>[]
}>

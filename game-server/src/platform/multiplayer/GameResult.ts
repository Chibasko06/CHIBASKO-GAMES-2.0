export type GameResult = Readonly<{
  gameId: string; winnerUserId: string; reason: 'score' | 'forfeit'
  players: readonly Readonly<{ userId: string; score: number }>[]
}>

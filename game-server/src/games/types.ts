export type GameDefinition = Readonly<{
  id: string
  roomType: string
  minPlayers: number
  maxPlayers: number
}>
export type GameRegistry = ReadonlyMap<string, GameDefinition>

import manifest from './gameManifest.generated.json' with { type: 'json' }
import type { Tables } from '@/types/database'

export type GameType = 'classic' | 'multiplayer_chibasko'
export type ClassicGame = Tables<'games'> & { game_type: 'classic'; game_url: string; multiplayer_game_id: null }
export type ChibaskoMultiplayerGame = Tables<'games'> & { game_type: 'multiplayer_chibasko'; game_url: null; multiplayer_game_id: string }
export function isClassicGame(game: Tables<'games'>): game is ClassicGame {
  return game.game_type === 'classic' && typeof game.game_url === 'string' && game.multiplayer_game_id === null
}
export function isChibaskoMultiplayerGame(game: Tables<'games'>): game is ChibaskoMultiplayerGame {
  return game.game_type === 'multiplayer_chibasko' && game.game_url === null && typeof game.multiplayer_game_id === 'string'
}
export function getMultiplayerDefinition(id: string) {
  const definitions: Readonly<Record<string, { minPlayers: number; maxPlayers: number }>> = manifest
  return Object.hasOwn(definitions, id) ? definitions[id] : undefined
}
export const multiplayerGames = Object.entries(manifest).map(([gameId, capacity]) => ({
  gameId, ...capacity, label: gameId === 'chibasko-pong' ? 'Chibasko Pong' : gameId,
}))
export function multiplayerCapacityLabel(id: string) {
  const definition = getMultiplayerDefinition(id)
  if (!definition) return 'Choisis un jeu'
  return `${definition.minPlayers === definition.maxPlayers ? definition.minPlayers : `${definition.minPlayers}–${definition.maxPlayers}`} joueurs`
}

// Keep inactive form inputs locally so changing type never silently discards them.
export function changeGameFormType<T extends { game_type: GameType; is_published: boolean }>(form: T, type: GameType, editing: boolean): T {
  return { ...form, game_type: type, is_published: !editing && type === 'multiplayer_chibasko' ? false : form.is_published }
}
export function gameFormPayload<T extends { game_type: GameType; game_url: string; multiplayer_game_id: string }>(form: T) {
  return { ...form,
    game_url: form.game_type === 'classic' ? form.game_url : null,
    multiplayer_game_id: form.game_type === 'multiplayer_chibasko' ? form.multiplayer_game_id : null,
  }
}

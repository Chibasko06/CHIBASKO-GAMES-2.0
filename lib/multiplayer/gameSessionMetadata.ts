import { INTEGRATION_VERSION, type GameSessionSnapshot } from '@chibaskogames/sdk'

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function keys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(k => allowed.includes(k)) }
function id(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) }
// Private transport decoder. Reject additional fields rather than passing a raw
// wire object into a game. This envelope is distinct from gameplay state.
export function readGameSession(value: unknown, gameId: string): GameSessionSnapshot | null {
  if (!record(value) || !keys(value, ['session','participants','localParticipantIds','connectedParticipantIds','availability'])) return null
  const s = value.session
  if (!record(s) || !keys(s,['id','gameId','integrationVersion','execution']) || !id(s.id) || s.gameId !== gameId
    || s.integrationVersion !== INTEGRATION_VERSION || s.execution !== 'online') return null
  if (!Array.isArray(value.participants) || !value.participants.length || value.participants.length > 64) return null
  const participants = []
  for (const p of value.participants) {
    if (!record(p) || !keys(p,['participantId','username','avatarUrl']) || !id(p.participantId) || typeof p.username !== 'string'
      || p.username.length > 128 || (p.avatarUrl !== null && (typeof p.avatarUrl !== 'string' || p.avatarUrl.length > 2048))) return null
    participants.push(Object.freeze({ participantId: p.participantId, username: p.username, avatarUrl: p.avatarUrl }))
  }
  const ids = new Set(participants.map(p => p.participantId))
  const list = (v: unknown): v is string[] => Array.isArray(v) && v.every(p => typeof p === 'string' && ids.has(p)) && new Set(v).size === v.length
  if (ids.size !== participants.length || !list(value.localParticipantIds) || value.localParticipantIds.length !== 1 || !list(value.connectedParticipantIds)
    || !['preparing','ready','completed'].includes(String(value.availability))) return null
  return Object.freeze({ session: Object.freeze({ id: s.id, gameId, integrationVersion: INTEGRATION_VERSION, execution: 'online' }),
    participants: Object.freeze(participants), localParticipantIds: Object.freeze([...value.localParticipantIds]),
    connectedParticipantIds: Object.freeze([...value.connectedParticipantIds]), availability: value.availability as GameSessionSnapshot['availability'] })
}

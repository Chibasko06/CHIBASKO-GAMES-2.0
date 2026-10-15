import { schema, t, type SchemaType } from '@colyseus/schema'
import { PONG } from './simulation.js'
const PongPlayer = schema({ participantId: t.string(), username: t.string(), avatarUrl: t.string(), side: t.string() }, 'PongPlayer')
export const PongState = schema({
  gameId: t.string().default(''), status: t.string().default('PREPARING'), expectedPlayers: t.number().default(0), players: t.map(PongPlayer),
  phase: t.string().default('READY'), remainingMs: t.number().default(0),
  width: t.number().default(PONG.width), height: t.number().default(PONG.height),
  paddleWidth: t.number().default(PONG.paddleWidth), paddleHeight: t.number().default(PONG.paddleHeight),
  inset: t.number().default(PONG.inset), radius: t.number().default(PONG.radius),
  leftPaddleY: t.number().default((PONG.height - PONG.paddleHeight) / 2), rightPaddleY: t.number().default((PONG.height - PONG.paddleHeight) / 2),
  ballX: t.number().default(PONG.width / 2), ballY: t.number().default(PONG.height / 2),
  leftScore: t.number().default(0), rightScore: t.number().default(0), winnerSide: t.string().default(''),
}, 'PongState')
export type PongState = SchemaType<typeof PongState>
export { PongPlayer }

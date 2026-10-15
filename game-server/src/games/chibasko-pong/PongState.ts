import { schema, t, type SchemaType } from '@colyseus/schema'
import { PONG, createPongModel } from '@chibaskogames/pong-engine'
const initial = createPongModel()
const PongPlayer = schema({ participantId: t.string(), username: t.string(), avatarUrl: t.string(), side: t.string() }, 'PongPlayer')
export const PongState = schema({
  gameId: t.string().default(''), status: t.string().default('PREPARING'), expectedPlayers: t.number().default(0), players: t.map(PongPlayer),
  phase: t.string().default('READY'), remainingMs: t.number().default(0),
  width: t.number().default(PONG.width), height: t.number().default(PONG.height),
  paddleWidth: t.number().default(PONG.paddleWidth), paddleHeight: t.number().default(PONG.paddleHeight),
  inset: t.number().default(PONG.inset), radius: t.number().default(PONG.radius),
  leftPaddleY: t.number().default(initial.leftPaddleY), rightPaddleY: t.number().default(initial.rightPaddleY),
  ballX: t.number().default(initial.ballX), ballY: t.number().default(initial.ballY),
  leftScore: t.number().default(initial.leftScore), rightScore: t.number().default(initial.rightScore), winnerSide: t.string().default(initial.winnerSide),
}, 'PongState')
export type PongState = SchemaType<typeof PongState>
export { PongPlayer }

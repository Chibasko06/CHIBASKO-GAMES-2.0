import { Room, type Client } from '@colyseus/core'
import { performance } from 'node:perf_hooks'
import { PlayerState, PlaygroundState } from '../schema/PlaygroundState.js'
import { validateMove } from '../validation/move.js'

export class PlaygroundRoom extends Room<{ state: PlaygroundState }> {
  state = new PlaygroundState()
  maxClients = 16
  private lastAccepted = new Map<string, number>()

  onCreate() {
    this.setPatchRate(50)
    this.onMessage('move', (client: Client, payload: unknown) => {
      const player = this.state.players.get(client.sessionId)
      if (!player) return
      const now = performance.now()
      const result = validateMove(payload, player, now, this.lastAccepted.get(client.sessionId))
      if (typeof result === 'string') {
        client.send('move_rejected', { code: result })
        return
      }
      player.x = result.x
      player.y = result.y
      this.lastAccepted.set(client.sessionId, now)
    })
  }

  onJoin(client: Client) {
    const player = new PlayerState()
    player.sessionId = client.sessionId
    this.state.players.set(client.sessionId, player)
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId)
    this.lastAccepted.delete(client.sessionId)
  }
}

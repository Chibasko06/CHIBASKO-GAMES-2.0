import { defineGame } from '@chibaskogames/sdk'
export const pongDefinition = defineGame({
  id: 'chibasko-pong', integrationVersion: 1,
  capabilities: { online: { access: ['private'], players: { min: 2, max: 2 } }, local: { players: { min: 2, max: 2 } } },
})

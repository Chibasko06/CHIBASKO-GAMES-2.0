import { pongDefinition } from '@chibaskogames/chibasko-pong'
import Online from '@chibaskogames/chibasko-pong/client'
import Local from '@chibaskogames/chibasko-pong/local'
import { pongServerModule, PongState } from '@chibaskogames/chibasko-pong/server'
import { createPongModel, PONG } from '@chibaskogames/chibasko-pong/shared'
import type { GameDefinition } from '@chibaskogames/sdk'
import type { GameClientProps } from '@chibaskogames/sdk/client'
import type { LocalGameProps } from '@chibaskogames/sdk/react'
import type { GameServerModule } from '@chibaskogames/sdk/server'
import type { ComponentType } from 'react'
const definition: GameDefinition = pongDefinition
const online: ComponentType<GameClientProps> = Online
const local: ComponentType<LocalGameProps> = Local
const server: GameServerModule<PongState> = pongServerModule
const model = createPongModel()
void [definition, online, local, server, model, PONG]

'use client'
import { clientGameRegistry } from '@/games/clientRegistry'
import type { ClientGameRegistry, GameClientProps } from '@chibaskogames/sdk/react'
import { createModuleRuntime } from './GameModuleRuntime'

export function createGameRuntime(registry: ClientGameRegistry) { return createModuleRuntime<GameClientProps>(registry) }
export default createGameRuntime(clientGameRegistry)

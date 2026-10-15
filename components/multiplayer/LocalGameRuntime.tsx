'use client'
import { useRouter } from 'next/navigation'
import { localGameRegistry } from '@/games/clientRegistry'
import type { LocalGameProps, LocalGameRegistry } from '@chibaskogames/sdk/react'
import { createModuleRuntime } from './GameModuleRuntime'

export function createLocalGameRuntime(registry: LocalGameRegistry) { return createModuleRuntime<LocalGameProps>(registry) }
const Runtime = createLocalGameRuntime(localGameRegistry)
export default function LocalGameRuntime({ gameId, slug }: { gameId: string; slug: string }) {
  const router = useRouter()
  return <Runtime gameId={gameId} onExit={() => router.push('/games/' + encodeURIComponent(slug))} />
}

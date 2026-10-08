"use client";

import { useRef } from 'react'
import GameReactions from './GameReactions'

type Props = {
  gameId: string
  gameUrl: string
  initialLikes: number
  initialDislikes: number
}


export default function GameViewport({
  gameId,
  gameUrl,
  initialLikes,
  initialDislikes,
}: Props) {
  const frameContainerRef = useRef<HTMLDivElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const openFullscreen = async () => {
    const container = frameContainerRef.current

    if (!container) {
      return
    }

    const fullscreenTarget = container as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void
    }

    try {
      if (fullscreenTarget.requestFullscreen) {
        await fullscreenTarget.requestFullscreen()
        return
      }

      if (fullscreenTarget.webkitRequestFullscreen) {
        await fullscreenTarget.webkitRequestFullscreen()
        return
      }
    } catch {
      // Fallback below opens the game in its own tab when the browser blocks fullscreen.
    }

    window.open(gameUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-cyan-900/50 bg-black">
      <div ref={frameContainerRef} className="aspect-video bg-black">
        <iframe
          ref={iframeRef}
          src={gameUrl}
          className="h-full w-full"
          allowFullScreen
          allow="fullscreen; autoplay; clipboard-write; gamepad"
        />
      </div>
      <div className="flex flex-col gap-3 border-t border-zinc-800 bg-zinc-950/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <GameReactions gameId={gameId} initialLikes={initialLikes} initialDislikes={initialDislikes} />

        <button
          type="button"
          onClick={() => void openFullscreen()}
          className="w-full rounded-full border border-cyan-700 px-4 py-2 text-sm font-bold text-cyan-200 transition-colors hover:bg-zinc-900 sm:w-auto"
        >
          Plein ecran
        </button>
      </div>
    </div>
  )
}

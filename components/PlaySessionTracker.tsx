"use client";

import { useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

type Props = {
  gameId: string
}

export default function PlaySessionTracker({ gameId }: Props) {
  const { session, user } = useAuth()

  useEffect(() => {
    let cancelled = false

    const trackView = async () => {
      const viewStorageKey = `chibaskogames:viewed:${gameId}`
      const historyStorageKey = `chibaskogames:history:${gameId}`

      if (!window.sessionStorage.getItem(viewStorageKey)) {
        window.sessionStorage.setItem(viewStorageKey, 'pending')
        await supabase.rpc('increment_game_view', { p_game_id: gameId })
        if (!cancelled) {
          window.sessionStorage.setItem(viewStorageKey, '1')
          window.dispatchEvent(new CustomEvent('game-viewed', { detail: { gameId } }))
        }
      }

      if (!user || window.sessionStorage.getItem(historyStorageKey)) {
        return
      }

      window.sessionStorage.setItem(historyStorageKey, 'pending')

      const profileSync = await ensureProfile(session)

      if (!profileSync.ok) {
        window.sessionStorage.removeItem(historyStorageKey)
        return
      }

      const { error } = await supabase.from('play_history').insert({
        user_id: user.id,
        game_id: gameId,
      })

      if (error) {
        window.sessionStorage.removeItem(historyStorageKey)
        return
      }

      if (!cancelled) {
        window.sessionStorage.setItem(historyStorageKey, '1')
      }
    }

    void trackView()

    return () => {
      cancelled = true
    }
  }, [gameId, session, user])

  return null
}

"use client";

import { useEffect } from 'react'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

type Props = {
  gameId: string
}

export default function PlaySessionTracker({ gameId }: Props) {
  useEffect(() => {
    const trackView = async () => {
      const viewStorageKey = `chibaskogames:viewed:${gameId}`
      const historyStorageKey = `chibaskogames:history:${gameId}`

      if (!window.sessionStorage.getItem(viewStorageKey)) {
        await supabase.rpc('increment_game_view', { p_game_id: gameId })
        window.sessionStorage.setItem(viewStorageKey, '1')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || window.sessionStorage.getItem(historyStorageKey)) {
        return
      }

      const profileSync = await ensureProfile()

      if (!profileSync.ok) {
        return
      }

      await supabase.from('play_history').insert({
        user_id: user.id,
        game_id: gameId,
      })

      window.sessionStorage.setItem(historyStorageKey, '1')
    }

    void trackView()
  }, [gameId])

  return null
}

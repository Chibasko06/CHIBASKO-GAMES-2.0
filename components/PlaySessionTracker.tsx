"use client";

import { useEffect } from 'react'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

type Props = {
  gameId: string
}

export default function PlaySessionTracker({ gameId }: Props) {
  useEffect(() => {
    const trackSession = async () => {
      const viewStorageKey = `chibaskogames:viewed:${gameId}`
      const playStorageKey = `chibaskogames:played:${gameId}`

      if (!window.sessionStorage.getItem(viewStorageKey)) {
        await supabase.rpc('increment_game_view', { p_game_id: gameId })
        window.sessionStorage.setItem(viewStorageKey, '1')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user || window.sessionStorage.getItem(playStorageKey)) {
        return
      }

      const profileSync = await ensureProfile()

      if (!profileSync.ok) {
        return
      }

      await supabase.rpc('record_game_play', { p_game_id: gameId })
      window.sessionStorage.setItem(playStorageKey, '1')
    }

    void trackSession()
  }, [gameId])

  return null
}

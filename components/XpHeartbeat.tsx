"use client";

import { useEffect } from 'react'
import { getClientSessionUser } from '@/lib/clientAuth'
import { supabase } from '@/lib/supabaseClient'

const XP_SYNC_INTERVAL_MS = 300_000

export default function XpHeartbeat() {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const syncXp = async () => {
      const user = await getClientSessionUser()

      if (!user) {
        return
      }

      await supabase.rpc('sync_profile_xp')
    }

    const start = async () => {
      await syncXp()

      intervalId = setInterval(() => {
        void syncXp()
      }, XP_SYNC_INTERVAL_MS)
    }

    void start()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user && intervalId) {
        clearInterval(intervalId)
        intervalId = null
        return
      }

      if (session?.user && !intervalId) {
        void start()
      }
    })

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }

      subscription.unsubscribe()
    }
  }, [])

  return null
}

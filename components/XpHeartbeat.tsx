"use client";

import { useEffect } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabaseClient'

const XP_SYNC_INTERVAL_MS = 300_000

export default function XpHeartbeat() {
  const { loading, user } = useAuth()

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null

    const syncXp = async () => {
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

    if (!loading && user) {
      void start()
    }

    if (!loading && !user && intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [loading, user])

  return null
}

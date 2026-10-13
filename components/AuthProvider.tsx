"use client";

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, restoreBrowserSession } from '@/lib/supabaseClient'

type AuthContextValue = {
  loading: boolean
  session: Session | null
  user: User | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let mounted = true
    let authEventReceived = false
    const timer = setTimeout(() => { if (mounted) setLoading(false) }, 10_000)

    const bootstrap = async () => {
      try {
        const currentSession = await restoreBrowserSession()

        if (!mounted || authEventReceived) return

        setSession(currentSession)
        setUser(currentSession?.user ?? null)
        setLoading(false)
      } catch {
        if (mounted && !authEventReceived) setLoading(false)
      } finally { clearTimeout(timer) }
    }

    void bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) {
        return
      }

      authEventReceived = true
      clearTimeout(timer)

      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      clearTimeout(timer)
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    loading,
    session,
    user,
  }), [loading, session, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}

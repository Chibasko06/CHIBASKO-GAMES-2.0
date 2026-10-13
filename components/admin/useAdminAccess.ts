'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabaseClient'

type Status = 'checking' | 'allowed' | 'unauthenticated' | 'denied' | 'error'
type Access = { userId: string | null; status: Status; checking: boolean }
export const ADMIN_CHECK_TIMEOUT_MS = 10_000

// UI state only. Every page/API still checks authentication and DB membership.
export function useAdminAccess() {
  const { user, session, loading } = useAuth()
  const userId = user?.id ?? null
  const token = session?.access_token ?? null
  const [access, setAccess] = useState<Access>({ userId: null, status: 'checking', checking: true })
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    if (loading || !userId || !token) return
    let active = true
    let cancel: (() => void) | undefined
    const check = () => {
      cancel?.()
      const controller = new AbortController()
      let current = true
      let timer: ReturnType<typeof setTimeout>
      cancel = () => { current = false; clearTimeout(timer); controller.abort() }
      setAccess(previous => ({ userId, status: previous.userId === userId && previous.status === 'allowed' ? 'allowed' : 'checking', checking: true }))
      const work = async (): Promise<Status> => {
        // Outside onAuthStateChange: let the SDK refresh an expired token first.
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        if (!data.session || data.session.user.id !== userId) return 'unauthenticated'
        if (!current || !active || controller.signal.aborted) throw new Error('Cancelled')
        const response = await fetch('/api/admin/status', {
          cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        if (response.status === 401) return 'unauthenticated'
        if (response.status === 403) return 'denied'
        if (!response.ok) throw new Error('Status unavailable')
        const payload: unknown = await response.json()
        if (!payload || typeof payload !== 'object' || !('isAdmin' in payload) || typeof payload.isAdmin !== 'boolean') throw new Error('Invalid status')
        return payload.isAdmin ? 'allowed' : 'denied'
      }
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Status timeout')) }, ADMIN_CHECK_TIMEOUT_MS)
      })
      void Promise.race([work(), timeout]).then(status => {
        if (active && current) setAccess({ userId, status, checking: false })
      }).catch(() => {
        if (active && current) setAccess({ userId, status: 'error', checking: false })
      }).finally(() => clearTimeout(timer))
    }
    const visible = () => { if (document.visibilityState === 'visible') check() }
    check()
    document.addEventListener('visibilitychange', visible)
    return () => { active = false; cancel?.(); document.removeEventListener('visibilitychange', visible) }
  }, [loading, userId, token, attempt])

  const status: Status = loading ? 'checking' : !userId || !token ? 'unauthenticated'
    : access.userId !== userId ? 'checking' : access.status
  return { status, checking: status === 'checking' || (status === 'allowed' && access.checking), retry }
}

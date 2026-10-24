'use client'

import {useEffect, useRef, useState} from 'react'
import {withTimeout} from './asyncOperation'

// A read started before an unresolved write settles cannot confirm its outcome.
export function useMutationRecovery(scope: string) {
  const [pendingState, setPendingState] = useState({scope, value: false})
  const [blockedState, setBlockedState] = useState({scope, value: false})
  const setPending = (value: boolean) => setPendingState({scope, value})
  const setBlocked = (value: boolean) => setBlockedState({scope, value})
  const state = useRef({active: false, revision: 0, writing: false, blocked: false,
    write: null as {settled: boolean} | null})

  useEffect(() => {
    const value = state.current
    value.active = true
    value.revision++
    value.writing = false
    value.blocked = false
    value.write = null
    return () => { value.active = false; value.revision++ }
  }, [scope])

  const mutate = async <T,>(operation: (current: () => boolean) => PromiseLike<T>) => {
    const value = state.current
    if (!value.active || value.writing || value.blocked) return {kind: 'stale'} as const
    const revision = ++value.revision
    const current = () => value.active && value.revision === revision
    const write = {settled: false}
    value.write = write
    value.writing = true
    setPending(true)
    const promise = Promise.resolve().then(() => operation(current))
    void promise.then(() => {write.settled = true}, () => {write.settled = true})
    try {
      const result = await withTimeout(promise)
      return current() ? {kind: 'confirmed', result} as const : {kind: 'stale'} as const
    } catch {
      if (!current()) return {kind: 'stale'} as const
      value.blocked = true
      setBlocked(true)
      return {kind: 'unconfirmed'} as const
    } finally {
      if (current()) {value.writing = false; setPending(false)}
    }
  }

  const check = async (read: (current: () => boolean) => Promise<void>) => {
    const value = state.current
    if (!value.active || value.writing) return 'stale' as const
    const revision = ++value.revision
    const current = () => value.active && value.revision === revision
    const write = value.write
    const settledBeforeRead = !write || write.settled
    setPending(true)
    try {
      await withTimeout(read(current))
      if (!current()) return 'stale' as const
      const ready = settledBeforeRead && value.write === write
      value.blocked = !ready
      setBlocked(!ready)
      return ready ? 'ready' as const : 'waiting' as const
    } catch {
      if (!current()) return 'stale' as const
      value.blocked = true
      setBlocked(true)
      return 'failed' as const
    } finally {
      if (current()) {value.revision++; setPending(false)}
    }
  }

  return {pending: pendingState.scope === scope && pendingState.value,
    blocked: blockedState.scope === scope && blockedState.value, mutate, check}
}

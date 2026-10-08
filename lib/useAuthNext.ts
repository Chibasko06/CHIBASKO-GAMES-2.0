'use client'
import { useSyncExternalStore } from 'react'
import { safeAuthNext } from './authRedirect'
const subscribe = (callback: () => void) => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback) }
const read = () => safeAuthNext(new URLSearchParams(window.location.search).get('next'))
export function useAuthNext() { return useSyncExternalStore(subscribe, read, () => '/') }

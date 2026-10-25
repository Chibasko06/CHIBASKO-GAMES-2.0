'use client'
import { useEffect, useRef, type ReactNode } from 'react'

export default function AdminEditor({ children, identity }: { children: ReactNode; identity: string }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { panel.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([disabled])')?.focus() }, [identity])
  return <aside ref={panel} aria-label="Panneau de modification" className="min-w-0 xl:col-start-2 xl:row-start-1 rounded-xl border border-cyan-900 bg-zinc-950 p-4 sm:p-5">{children}</aside>
}

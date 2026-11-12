'use client'
import { useEffect, useRef, type ReactNode } from 'react'

export default function AdminEditor({ children, identity, wide=false }: { children: ReactNode; identity: string;wide?:boolean }) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => { panel.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([disabled])')?.focus() }, [identity])
  const layout=wide?'mx-auto w-full max-w-[960px] max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain':'xl:col-start-2 xl:row-start-1'
  return <aside ref={panel} aria-label="Panneau de modification" className={`min-w-0 ${layout} rounded-xl border border-cyan-900 bg-zinc-950 p-4 sm:p-5`}>{children}</aside>
}

'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

export const adminSections = [
  { id: 'overview', label: 'Vue d’ensemble', href: '/admin', icon: '◫' },
  { id: 'games', label: 'Jeux', href: '/admin?section=games', icon: '▷' },
  { id: 'submissions', label: 'Soumissions', href: '/admin/game-builds', icon: '⇥' },
  { id: 'moderation', label: 'Modération', href: '/admin/moderation', icon: '⚑' },
  { id: 'users', label: 'Utilisateurs', href: '/admin?section=users', icon: '♙' },
  { id: 'deletions', label: 'Suppressions de comptes', href: '/admin/account-deletions', icon: '⊘' },
  { id: 'categories', label: 'Catégories', href: '/admin?section=categories', icon: '▦' },
  { id: 'faq', label: 'FAQ', href: '/admin?section=faq', icon: '?' },
] as const
export type AdminSection = typeof adminSections[number]['id']

export default function AdminShell({ active, title, actions, children }: { active: AdminSection; title?: string; actions?: ReactNode; children: ReactNode }) {
  const router = useRouter()
  return <div data-admin-console className="admin-console grid min-w-0 items-start gap-6 lg:grid-cols-[12rem_minmax(0,1fr)]">
    <aside className="min-w-0 lg:sticky lg:top-5">
      <p className="mb-4 hidden px-3 text-xs font-bold uppercase tracking-widest text-zinc-500 lg:block">Chibasko Games<br />
        <span className="mt-1 block text-cyan-300">Administration</span>
      </p>
      <nav aria-label="Rubriques administratives" className="hidden space-y-1 lg:block">{adminSections.map(section =>
        <Link key={section.id} href={section.href} aria-current={active === section.id ? 'page' : undefined} className={'flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm ' + (active === section.id ? 'border-cyan-800 bg-cyan-950/40 font-semibold text-cyan-200' : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-white')}>
          <span aria-hidden="true" className="w-4 text-center">{section.icon}</span>{section.label}</Link>)}</nav>
      <div className="text-sm text-zinc-400 lg:hidden">
        <label htmlFor="admin-section">Section administrative</label>
        <select id="admin-section" value={active} onChange={event => { const section = adminSections.find(item => item.id === event.target.value); if (section) router.push(section.href) }} className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-white">{adminSections.map(section =>
          <option key={section.id} value={section.id}>{section.label}</option>)}</select>
      </div>
    </aside>
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-5">
        <div>
          <p className="mb-1 text-xs text-cyan-300">Administration</p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{title ?? adminSections.find(section => section.id === active)?.label}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}<Link href="/" className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300">Voir le site ↗</Link>
        </div>
      </header>
      {children}
    </div>
  </div>
}

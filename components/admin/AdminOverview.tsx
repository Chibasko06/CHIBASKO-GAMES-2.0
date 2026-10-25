'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

type Overview = Record<'games' | 'publishedGames' | 'users' | 'buildsAwaitingReview' | 'buildsAwaitingValidation' | 'deletionsAwaitingReview' | 'deletionsBlocked' | 'notificationsBlocked', number>
export default function AdminOverview({ token }: { token: string | null }) {
  const [data, setData] = useState<Overview | null>(null), [error, setError] = useState(false), [reload, setReload] = useState(0)
  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    fetch('/api/admin/overview', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => { if (!response.ok) throw Error(); return response.json() })
      .then(body => { if (!controller.signal.aborted) { if (!body.overview) throw Error(); setData(body.overview); setError(false) } })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [token, reload])
  if (error) return <div role="alert" className="rounded-xl border border-rose-900 bg-rose-950/20 p-4">
    <p>Les compteurs ne sont pas disponibles.</p>
    <button className="mt-3 text-cyan-300 underline" onClick={() => setReload(n => n + 1)}>Réessayer</button>
  </div>
  if (!data) return <p role="status" className="text-sm text-zinc-400">Chargement de la vue d’ensemble…</p>
  const metrics = [['Jeux au catalogue', data.games, '/admin?section=games'], ['Jeux publiés', data.publishedGames, '/admin?section=games&status=published'], ['Utilisateurs', data.users, '/admin?section=users'], ['Soumissions à examiner', data.buildsAwaitingReview, '/admin/game-builds']] as const
  const tasks = [['Soumissions à examiner', data.buildsAwaitingReview, '/admin/game-builds'], ['Vérifications techniques en attente', data.buildsAwaitingValidation, '/admin/game-builds'], ['Suppressions à vérifier', data.deletionsAwaitingReview, '/admin/account-deletions'], ['Suppressions nécessitant une intervention', data.deletionsBlocked, '/admin/account-deletions']] as const
  return <div className="space-y-6">
    <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(([label, count, href]) =>
      <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
        <dt className="text-xs text-zinc-400">
          <Link href={href}>{label}</Link>
        </dt>
        <dd className="mt-2 text-2xl font-bold text-white">{count.toLocaleString('fr-FR')}</dd>
      </div>)}</dl>
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <h2 className="border-b border-zinc-800 px-5 py-4 text-base font-bold">À traiter</h2>
      <ul className="divide-y divide-zinc-800">{tasks.map(([label, count, href]) =>
        <li key={label}>
          <Link href={href} className="flex min-h-14 items-center justify-between gap-4 px-5 py-3 hover:bg-zinc-900">
            <span className="text-sm text-zinc-300">{label}</span>
            <span className={'rounded-md border px-2 py-1 text-sm font-bold ' + (count ? 'border-amber-800 bg-amber-950/30 text-amber-200' : 'border-zinc-800 text-zinc-500')}>{count} <span aria-hidden="true">↗</span>
            </span>
          </Link>
        </li>)}</ul>
    </section>
    {data.notificationsBlocked > 0 && <p role="status" className="rounded-xl border border-amber-900 bg-amber-950/20 p-4 text-sm text-amber-200">{data.notificationsBlocked} notification(s) de soumission nécessitent une vérification de la maintenance.</p>}
  </div>
}

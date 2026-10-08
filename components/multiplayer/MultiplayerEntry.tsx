'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'

export default function MultiplayerEntry({ available = true }: { available?: boolean }) {
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [invitation, setInvitation] = useState(false)
  const [code, setCode] = useState('')
  const id = useId()
  // This phase deliberately exposes no network action, even for signed-in users.
  const action = () => { if (!loading && !user) setInvitation(true) }
  const button = 'rounded-full border border-cyan-700 px-5 py-3 text-sm font-bold text-cyan-200 hover:bg-cyan-950/30 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50'
  return <div className="space-y-4">
    <p id={`${id}-availability`} className="text-sm leading-6 text-zinc-400">{available ? 'En préparation : les parties ne sont pas encore ouvertes au public.' : 'Ce jeu multijoueur est momentanément indisponible.'}</p>
    <button type="button" disabled={!available} aria-expanded={open} aria-controls={`${id}-entry`} onClick={() => setOpen(value => !value)} className="rounded-full bg-cyan-400 px-6 py-3 text-sm font-black text-black hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">Jouer en multijoueur</button>
    {open && <div id={`${id}-entry`} className="space-y-4 rounded-2xl border border-zinc-800 bg-black/30 p-4 sm:p-5">
      <button type="button" onClick={action} disabled={loading || !!user} aria-describedby={`${id}-availability`} className={button}>Créer une partie</button>
      <form onSubmit={event => { event.preventDefault(); action() }} className="space-y-2">
        <label htmlFor={`${id}-code`} className="block text-sm font-semibold text-zinc-200">Code de partie</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input id={`${id}-code`} value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={6} pattern="[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}" required autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="AB7KQ2" className="min-w-0 rounded-xl border border-zinc-700 bg-black px-4 py-3 font-mono uppercase tracking-[0.2em] text-white focus:border-cyan-400 focus:outline-2 focus:outline-cyan-400" />
          <button type="submit" disabled={loading || !!user || !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code)} aria-describedby={`${id}-availability`} className={button}>Rejoindre</button>
        </div>
      </form>
      {invitation && !user && <div role="status" className="space-y-3 text-sm text-zinc-300">
        <p>Connecte-toi ou crée ton compte pour jouer en multijoueur. Les parties ouvriront prochainement.</p>
        <div className="flex flex-wrap gap-3"><Link className={button} href="/login">Se connecter</Link><Link className={button} href="/register">Créer un compte</Link></div>
      </div>}
    </div>}
  </div>
}

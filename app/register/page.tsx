"use client";

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getClientSessionUser } from '@/lib/clientAuth'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false)

  useEffect(() => {
    const load = async () => {
      const user = await getClientSessionUser()

      setAlreadyLoggedIn(Boolean(user))
    }

    void load()
  }, [])

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_name: username,
          username,
        },
      },
    })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      await ensureProfile(data.session)
    }

    alert('Inscription reussie !')
    window.location.href = '/login'
  }

  if (alreadyLoggedIn) {
    return (
      <div className="mx-auto max-w-md rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8 text-center">
        <h1 className="text-2xl font-black uppercase text-white">Tu es deja connecte</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          Tu peux aller directement sur ton tableau de bord ou explorer les jeux.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-black uppercase text-black">
            Mon profil
          </Link>
          <Link href="/games" className="rounded-full border border-cyan-700 px-5 py-3 text-sm font-black uppercase text-cyan-200">
            Les jeux
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8">
      <div className="mb-6 space-y-3">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Inscription joueur</p>
        <h1 className="text-3xl font-black uppercase text-white">Creer ton profil</h1>
        <p className="text-sm leading-6 text-zinc-400">
          Un seul pseudo, ton email, ton mot de passe et ton profil ChibaskoGames est pret.
        </p>
      </div>

      <form onSubmit={handleSignUp} className="space-y-4">
        <input
          type="text"
          required
          value={username}
          placeholder="Pseudo"
          className="w-full rounded-2xl bg-black/60 border border-zinc-800 p-4 text-sm text-white outline-none focus:border-cyan-500"
          onChange={(event) => setUsername(event.target.value)}
        />
        <input
          type="email"
          required
          value={email}
          placeholder="Email"
          className="w-full rounded-2xl bg-black/60 border border-zinc-800 p-4 text-sm text-white outline-none focus:border-cyan-500"
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="password"
          required
          value={password}
          placeholder="Mot de passe"
          className="w-full rounded-2xl bg-black/60 border border-zinc-800 p-4 text-sm text-white outline-none focus:border-cyan-500"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          disabled={loading}
          className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Inscription...' : "S'inscrire"}
        </button>
      </form>
    </div>
  )
}

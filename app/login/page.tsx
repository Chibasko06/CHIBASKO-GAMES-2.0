"use client";

import { useState } from 'react'
import Link from 'next/link'
import { useEffect } from 'react'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false)

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      setAlreadyLoggedIn(Boolean(user))
    }

    void load()
  }, [])

  const handleLogin = async () => {
    setLoading(true)

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    await ensureProfile(data.session)
    window.location.href = '/'
  }

  if (alreadyLoggedIn) {
    return (
      <div className="mx-auto max-w-md rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8 text-center">
        <h1 className="text-2xl font-black uppercase text-white">Tu es deja connecte</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          Pas besoin de te reconnecter. Tu peux retourner sur ton profil ou parcourir le catalogue.
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
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Connexion joueur</p>
        <h1 className="text-3xl font-black uppercase text-white">Acces compte</h1>
      </div>

      <div className="space-y-4">
        <input
          type="email"
          value={email}
          placeholder="Email"
          className="w-full rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
          onChange={(event) => setEmail(event.target.value)}
        />
        <input
          type="password"
          value={password}
          placeholder="Mot de passe"
          className="w-full rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
          onChange={(event) => setPassword(event.target.value)}
        />

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Connexion...' : 'Connexion'}
        </button>

        <p className="text-sm text-zinc-400">
          Pas encore de compte ?{' '}
          <Link href="/register" className="text-cyan-300 hover:text-cyan-200">
            Cree ton profil joueur
          </Link>
        </p>
      </div>
    </div>
  )
}

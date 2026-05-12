"use client";

import Link from 'next/link'
import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [showOptional, setShowOptional] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { loading: authLoading, user } = useAuth()

  const handleSignUp = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    const trimmedUsername = username.trim()
    const trimmedBio = bio.trim()

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          user_name: trimmedUsername,
          username: trimmedUsername,
          bio: trimmedBio,
          onboarding_bio: trimmedBio,
        },
      },
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      await ensureProfile(data.session)
      window.location.href = '/'
      return
    }

    setMessage('Compte cree. Verifie ton email pour confirmer ton inscription, puis connecte-toi quand tu veux.')
    setLoading(false)
  }

  if (!authLoading && user) {
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
    <div className="mx-auto max-w-xl rounded-[32px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(8,8,10,0.99))] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)] sm:p-8">
      <div className="mb-8 rounded-[28px] border border-cyan-950/70 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_38%),linear-gradient(180deg,rgba(14,18,28,0.95),rgba(9,9,11,0.98))] p-6">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Inscription joueur</p>
        <h1 className="mt-3 text-3xl font-black uppercase text-white sm:text-4xl">Creer ton compte</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-zinc-400">
          Va a l essentiel: pseudo, email et mot de passe. Tu peux personnaliser ton profil maintenant ou plus tard dans tes parametres.
        </p>
      </div>

      <form onSubmit={handleSignUp} className="space-y-5">
        <div className="rounded-[26px] border border-zinc-800 bg-black/35 p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Obligatoire</p>
              <h2 className="mt-2 text-xl font-black uppercase text-white">Infos principales</h2>
            </div>
            <span className="rounded-full border border-zinc-700 px-3 py-2 text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">
              rapide
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <input
              type="text"
              required
              value={username}
              placeholder="Pseudo"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-sm text-white outline-none focus:border-cyan-500"
              onChange={(event) => setUsername(event.target.value)}
            />
            <input
              type="email"
              required
              value={email}
              placeholder="Email"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-sm text-white outline-none focus:border-cyan-500"
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              type="password"
              required
              value={password}
              placeholder="Mot de passe"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-sm text-white outline-none focus:border-cyan-500"
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        <div className="rounded-[26px] border border-zinc-800 bg-black/25">
          <button
            type="button"
            onClick={() => setShowOptional((current) => !current)}
            className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-6"
          >
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Optionnel</p>
              <h2 className="mt-2 text-lg font-black uppercase text-white">Personnaliser mon profil</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Ajoute une bio courte maintenant. L avatar pourra etre ajoute apres confirmation si tu preferes.
              </p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-900 text-xl font-light text-cyan-300">
              {showOptional ? '−' : '+'}
            </span>
          </button>

          {showOptional ? (
            <div className="border-t border-zinc-800 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <textarea
                  value={bio}
                  placeholder="Bio courte optionnelle"
                  className="min-h-28 w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-sm text-white outline-none focus:border-cyan-500"
                  onChange={(event) => setBio(event.target.value)}
                />
                <div className="rounded-2xl border border-dashed border-cyan-900/70 bg-cyan-950/10 p-4">
                  <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">Avatar</p>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    Pour garder l inscription rapide, l avatar se complete juste apres dans ton profil, une fois le compte confirme.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <button
          disabled={loading}
          className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Inscription...' : "S'inscrire"}
        </button>

        {message ? <p className="text-sm leading-6 text-cyan-300">{message}</p> : null}

        <p className="text-sm leading-6 text-zinc-400">
          Tu pourras toujours modifier ton pseudo, ta bio ou ton avatar plus tard depuis ton profil.
        </p>
      </form>
    </div>
  )
}

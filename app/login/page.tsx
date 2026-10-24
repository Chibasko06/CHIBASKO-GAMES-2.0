"use client";

import FormField from '@/components/ui/FormField'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import SocialAuthButtons from '@/components/SocialAuthButtons'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useAuthNext } from '@/lib/useAuthNext'
import {withTimeout} from '@/lib/asyncOperation'

export default function LoginPage() {
  const attemptRef = useRef({mounted: false, id: 0})
  useEffect(() => {
    const attempt = attemptRef.current
    attempt.mounted = true
    return () => { attempt.mounted = false; attempt.id++ }
  }, [])
  const next = useAuthNext()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { loading: authLoading, user } = useAuth()
  const resetPasswordHref = useMemo(() => {
    const normalizedEmail = email.trim()
    return normalizedEmail ? `/reset-password?email=${encodeURIComponent(normalizedEmail)}` : '/reset-password'
  }, [email])

  const handleLogin = async () => {
    const id = ++attemptRef.current.id
    const current = () => attemptRef.current.mounted && attemptRef.current.id === id
    setMessage(null)
    setLoading(true)

    try {
      const {data, error} = await withTimeout(supabase.auth.signInWithPassword({email, password}))
      if (!current()) return
      if (error) { setMessage('Connexion refusée. Vérifie tes identifiants et la confirmation de ton adresse e-mail.'); return }
      await ensureProfile(data.session)
      if (!current()) return
      router.replace(next)
    } catch {
      if (!current()) return
      setMessage('La connexion a été interrompue ou a pris trop de temps. Réessaie dans un instant.')
    } finally { if (current()) setLoading(false) }
  }

  if (!authLoading && user) {
    return (
      <div className="mx-auto max-w-md rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8 text-center">
        <h1 className="text-2xl font-black uppercase text-white">Tu es deja connecte</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          Pas besoin de te reconnecter. Tu peux retourner sur ton profil ou parcourir le catalogue.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {next !== '/' && <Link href={next} className="rounded-full border border-cyan-700 px-5 py-3 text-sm font-black text-cyan-200">Continuer</Link>}
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
        <p className="text-sm leading-6 text-zinc-400">
          Connecte-toi avec ton compte Chibasko Games ou passe directement par Google.
        </p>
      </div>

      <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(!loading)void handleLogin()}}>
        <SocialAuthButtons
          nextPath={next}
          onError={(nextMessage) => setMessage(nextMessage || null)}
        />

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">ou</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <FormField label="Email" descriptionId="auth-feedback"><input
          type="email"
          value={email}
          placeholder="Email"
          className="w-full rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
          onChange={(event) => setEmail(event.target.value)}
        /></FormField>
        <FormField label="Mot de passe" descriptionId="auth-feedback"><input
          type="password"
          value={password}
          placeholder="Mot de passe"
          className="w-full rounded-2xl bg-black/60 border border-zinc-800 p-4 text-white outline-none focus:border-cyan-500"
          onChange={(event) => setPassword(event.target.value)}
        /></FormField>

        <div className="flex justify-end">
          <Link
            href={resetPasswordHref}
            className="text-sm text-cyan-300 transition hover:text-cyan-200"
          >
            Mot de passe oublie ?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? 'Connexion...' : 'Connexion'}
        </button>

        {message ? <p id="auth-feedback" role="status" className="text-sm text-cyan-300">{message}</p> : null}

        <p className="text-sm text-zinc-400">
          Pas encore de compte ?{' '}
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="text-cyan-300 hover:text-cyan-200">
            Cree ton profil joueur
          </Link>
        </p>
      </form>
    </div>
  )
}

"use client";

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type RecoveryStatus = 'loading' | 'ready' | 'invalid' | 'success'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<RecoveryStatus>('loading')
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true

    const bootstrapRecovery = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const type = hashParams.get('type')

      if (accessToken && refreshToken && type === 'recovery') {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (!mounted) {
          return
        }

        if (error) {
          setStatus('invalid')
          setMessage('Le lien de reinitialisation est invalide ou expire.')
          return
        }

        setStatus('ready')
        setMessage('Tu peux maintenant choisir un nouveau mot de passe.')
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (session) {
        setStatus('ready')
        setMessage('Choisis ton nouveau mot de passe.')
        return
      }

      setStatus('invalid')
      setMessage('Ouvre cette page depuis le lien recu par email pour reinitialiser ton mot de passe.')
    }

    void bootstrapRecovery()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) {
        return
      }

      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setStatus('ready')
        setMessage('Choisis ton nouveau mot de passe.')
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (nextPassword.length < 8) {
      setMessage('Le nouveau mot de passe doit faire au moins 8 caracteres.')
      return
    }

    if (nextPassword !== confirmPassword) {
      setMessage('Les deux mots de passe doivent etre identiques.')
      return
    }

    setSaving(true)

    const { error } = await supabase.auth.updateUser({
      password: nextPassword,
    })

    if (error) {
      setMessage(error.message)
      setSaving(false)
      return
    }

    setStatus('success')
    setMessage('Mot de passe modifie. Tu peux maintenant te reconnecter.')
    setNextPassword('')
    setConfirmPassword('')
    setSaving(false)
    window.setTimeout(() => router.push('/login'), 1200)
  }

  return (
    <div className="mx-auto max-w-md rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8">
      <div className="mb-6 space-y-3">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Recuperation compte</p>
        <h1 className="text-3xl font-black uppercase text-white">Nouveau mot de passe</h1>
      </div>

      {status === 'invalid' ? (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-zinc-300">{message}</p>
          <Link
            href="/login"
            className="inline-flex rounded-full bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black"
          >
            Retour connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={nextPassword}
            placeholder="Nouveau mot de passe"
            className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            onChange={(event) => setNextPassword(event.target.value)}
            disabled={status !== 'ready' || saving}
          />
          <input
            type="password"
            value={confirmPassword}
            placeholder="Confirmer le nouveau mot de passe"
            className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={status !== 'ready' || saving}
          />

          <button
            type="submit"
            disabled={status !== 'ready' || saving}
            className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Mise a jour...' : 'Valider le nouveau mot de passe'}
          </button>

          {message ? <p className="text-sm text-cyan-300">{message}</p> : null}

          {status === 'loading' ? (
            <p className="text-sm text-zinc-400">Verification du lien en cours...</p>
          ) : null}
        </form>
      )}
    </div>
  )
}

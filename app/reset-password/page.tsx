"use client";

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type ResetStep = 'request' | 'verify' | 'confirm' | 'success'

async function submitReset(step: 'request' | 'verify' | 'confirm', body: Record<string, string>) {
  try {
    const response = await fetch(`/api/auth/password-reset/${step}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || !payload?.ok) {
      return { ok: false, message: String(payload?.error || 'Requete impossible. Reessaie plus tard.') }
    }
    return { ok: true, message: String(payload.message || '') }
  } catch {
    return { ok: false, message: 'Connexion interrompue. Reessaie plus tard.' }
  }
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [step, setStep] = useState<ResetStep>('request')
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleRequestCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (!email.trim()) {
      setMessage('Renseigne ton email pour recevoir un code.')
      return
    }

    setSubmitting(true)

    const result = await submitReset('request', { email })
    if (!result.ok) {
      setMessage(result.message)
      setSubmitting(false)
      return
    }

    setStep('verify')
    setMessage(result.message)
    setSubmitting(false)
  }

  const handleVerifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (!email.trim() || !code.trim()) {
      setMessage('Entre ton email et le code a 6 chiffres.')
      return
    }

    setSubmitting(true)

    const result = await submitReset('verify', { email, code })
    if (!result.ok) {
      setMessage(result.message)
      setSubmitting(false)
      return
    }

    setStep('confirm')
    setMessage(result.message)
    setSubmitting(false)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)

    if (nextPassword.length < 8 || nextPassword.length > 128) {
      setMessage('Le nouveau mot de passe doit faire entre 8 et 128 caracteres.')
      return
    }

    if (nextPassword !== confirmPassword) {
      setMessage('Les deux mots de passe doivent etre identiques.')
      return
    }

    if (!email.trim() || !code.trim()) {
      setMessage('Le code de confirmation est requis.')
      return
    }

    setSubmitting(true)

    const result = await submitReset('confirm', { email, code, password: nextPassword })
    if (!result.ok) {
      setMessage(result.message)
      setSubmitting(false)
      return
    }

    setStep('success')
    setMessage(result.message)
    setNextPassword('')
    setConfirmPassword('')
    setSubmitting(false)
    window.setTimeout(() => router.push('/login'), 1200)
  }

  return (
    <div className="mx-auto max-w-md rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8">
      <div className="mb-6 space-y-3">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Recuperation compte</p>
        <h1 className="text-3xl font-black uppercase text-white">Mot de passe oublie</h1>
        <p className="text-sm leading-6 text-zinc-400">
          Entre ton email, valide le code recu par email, puis choisis ton nouveau mot de passe.
        </p>
      </div>

      {step === 'request' ? (
        <form onSubmit={handleRequestCode} className="space-y-4">
          <input
            type="email"
            value={email}
            placeholder="Email"
            className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Envoi du code...' : 'Recevoir le code'}
          </button>
          {message ? <p className="text-sm text-cyan-300">{message}</p> : null}
        </form>
      ) : null}

      {step === 'verify' ? (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <input
            type="email"
            value={email}
            placeholder="Email"
            className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            onChange={(event) => setEmail(event.target.value)}
            disabled={submitting}
          />
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            placeholder="Code a 6 chiffres"
            className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            disabled={submitting}
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Verification...' : 'Verifier le code'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCode('')
              setMessage(null)
              setStep('request')
            }}
            className="w-full rounded-full border border-zinc-700 py-4 text-sm font-black uppercase tracking-[0.2em] text-zinc-200"
          >
            Renvoyer un autre code
          </button>
          {message ? <p className="text-sm text-cyan-300">{message}</p> : null}
        </form>
      ) : null}

      {step === 'confirm' ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={nextPassword}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Nouveau mot de passe"
            className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            onChange={(event) => setNextPassword(event.target.value)}
            disabled={submitting}
          />
          <input
            type="password"
            value={confirmPassword}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Confirmer le nouveau mot de passe"
            className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            onChange={(event) => setConfirmPassword(event.target.value)}
            disabled={submitting}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-cyan-400 py-4 text-sm font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Mise a jour...' : 'Valider le nouveau mot de passe'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setCode('')
              setNextPassword('')
              setConfirmPassword('')
              setMessage(null)
              setStep('request')
            }}
            className="w-full rounded-full border border-zinc-700 py-3 text-sm font-bold text-zinc-200 disabled:opacity-60"
          >
            Demander un nouveau code
          </button>
          {message ? <p className="text-sm text-cyan-300">{message}</p> : null}
        </form>
      ) : null}

      {step === 'success' ? (
        <div className="space-y-5">
          <p className="text-sm leading-6 text-zinc-300">{message || 'Mot de passe modifie.'}</p>
          <Link
            href="/login"
            className="inline-flex rounded-full bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black"
          >
            Retour connexion
          </Link>
        </div>
      ) : null}
    </div>
  )
}

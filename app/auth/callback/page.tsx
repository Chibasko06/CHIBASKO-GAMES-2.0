"use client";

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Connexion en cours...')

  useEffect(() => {
    let mounted = true

    const nextPath =
      typeof window !== 'undefined'
        ? (() => {
      const next = new URLSearchParams(window.location.search).get('next') || '/'
      return next.startsWith('/') ? next : '/'
        })()
        : '/'

    const finishSignIn = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (!session) {
        setMessage('Finalisation de la connexion...')
        return
      }

      const syncResult = await ensureProfile(session)

      if (!mounted) {
        return
      }

      if (!syncResult.ok) {
        setMessage('Connexion reussie, mais impossible de preparer ton profil.')
        setTimeout(() => {
          router.replace(nextPath)
        }, 1200)
        return
      }

      router.replace(nextPath)
    }

    void finishSignIn()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted || !session) {
        return
      }

      const syncResult = await ensureProfile(session)

      if (!mounted) {
        return
      }

      if (!syncResult.ok) {
        setMessage('Connexion reussie, mais ton profil doit encore etre synchronise.')
        setTimeout(() => {
          router.replace(nextPath)
        }, 1200)
        return
      }

      router.replace(nextPath)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [router])

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-4">
      <section className="w-full rounded-[30px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(8,8,10,0.99))] p-8 text-center">
        <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Connexion sociale</p>
        <h1 className="mt-4 text-3xl font-black uppercase text-white">Patiente un instant</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">{message}</p>
      </section>
    </main>
  )
}

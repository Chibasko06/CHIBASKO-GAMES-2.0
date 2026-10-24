'use client'

import {useEffect, useState} from 'react'
import Link from 'next/link'
import {useRouter} from 'next/navigation'
import {ensureProfile} from '@/lib/profileSync'
import {supabase} from '@/lib/supabaseClient'
import {safeAuthNext} from '@/lib/authRedirect'
import {AUTH_OPERATION_TIMEOUT_MS} from '@/lib/asyncOperation'
import type {Session} from '@supabase/supabase-js'

export default function AuthCallbackPage() {
  const router = useRouter()
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const [message, setMessage] = useState('Connexion en cours…')

  useEffect(() => {
    let active = true
    let finishing = false
    const next = safeAuthNext(new URLSearchParams(window.location.search).get('next') || '/')
    const fail = (text: string) => {
      if (!active) return
      active = false
      setMessage(text)
      setFailed(true)
    }
    const deadline = setTimeout(() => fail('La connexion n’a pas pu être finalisée. Réessaie ou retourne à la connexion.'), AUTH_OPERATION_TIMEOUT_MS)
    const finish = async (session: Session | null) => {
      if (!active || !session || finishing) return
      finishing = true
      try {
        const result = await ensureProfile(session)
        if (!active) return
        if (!result.ok) { fail('Connexion réussie, mais le profil est indisponible. Réessaie dans un instant.'); return }
        router.replace(next)
        clearTimeout(deadline)
        active = false
      } catch { fail('La connexion a été interrompue. Réessaie dans un instant.') }
    }
    const {data: {subscription}} = supabase.auth.onAuthStateChange((_event, session) => {
      // Keep profile requests outside the Auth callback's session lock.
      queueMicrotask(() => { void finish(session) })
    })
    void supabase.auth.getSession().then(({data, error}) => {
      if (error) { fail('Impossible de vérifier la session. Reconnecte-toi.'); return }
      void finish(data.session)
    }).catch(() => fail('La connexion a été interrompue. Réessaie dans un instant.'))
    return () => { active = false; clearTimeout(deadline); subscription.unsubscribe() }
  }, [attempt, router])

  return <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-4">
    <section className="w-full space-y-5 rounded-[30px] border border-cyan-950/80 bg-zinc-950 p-8 text-center">
      <h1 className="text-3xl font-black text-white">Connexion à Chibasko Games</h1>
      <p role={failed ? 'alert' : 'status'} className="text-sm text-zinc-300">{message}</p>
      {failed && <div className="flex flex-wrap justify-center gap-4">
        <button type="button" className="rounded-lg bg-cyan-400 px-4 py-3 font-bold text-black" onClick={() => {setFailed(false); setMessage('Connexion en cours…'); setAttempt(value => value + 1)}}>Réessayer</button>
        <Link href="/login" className="text-cyan-300 underline">Retour à la connexion</Link>
        <Link href="/" className="text-cyan-300 underline">Accueil</Link>
      </div>}
    </section>
  </div>
}

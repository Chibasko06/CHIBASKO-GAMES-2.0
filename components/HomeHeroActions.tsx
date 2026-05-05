"use client";

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function HomeHeroActions() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (mounted) {
        setIsLoggedIn(Boolean(user))
      }
    }

    void load()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setIsLoggedIn(Boolean(session?.user))
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <div className="flex flex-wrap gap-3">
      <Link
        href="/games"
        className="rounded-full bg-cyan-400 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-cyan-300"
      >
        Explorer les jeux
      </Link>
      {isLoggedIn ? (
        <Link
          href="/dashboard"
          className="rounded-full border border-cyan-700/70 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-zinc-900"
        >
          Mon profil
        </Link>
      ) : (
        <Link
          href="/register"
          className="rounded-full border border-cyan-700/70 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-zinc-900"
        >
          Creer un compte
        </Link>
      )}
    </div>
  )
}

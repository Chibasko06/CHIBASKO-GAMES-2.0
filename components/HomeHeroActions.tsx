"use client";

import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'

export default function HomeHeroActions() {
  const { loading, user } = useAuth()

  return (
    <div className="grid gap-3 sm:flex sm:flex-wrap">
      <Link
        href="/games"
        className="rounded-full bg-cyan-400 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.16em] text-black transition hover:bg-cyan-300 sm:px-6"
      >
        Explorer les jeux
      </Link>
      {loading ? (
        <div className="h-[52px] w-48 rounded-full border border-zinc-800 bg-zinc-950/80 animate-pulse" />
      ) : user ? (
        <Link
          href="/dashboard"
          className="rounded-full border border-cyan-700/70 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.16em] text-cyan-200 transition hover:bg-zinc-900 sm:px-6"
        >
          Mon profil
        </Link>
      ) : (
        <Link
          href="/register"
          className="rounded-full border border-cyan-700/70 px-5 py-3 text-center text-sm font-black uppercase tracking-[0.16em] text-cyan-200 transition hover:bg-zinc-900 sm:px-6"
        >
          Creer un compte
        </Link>
      )}
    </div>
  )
}

"use client";

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabaseClient'
import UserDropdown from '@/components/UserDropdown'
import ChibaskoLogo from '@/components/ChibaskoLogo'

export function Navbar() {
  const { user, session, loading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const loadUser = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .maybeSingle()

        if (mounted) {
          setAvatarUrl(profile?.avatar_url ?? null)
        }

        if (session?.access_token) {
          const response = await fetch('/api/admin/status', {
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          })

          const payload = await response.json()

          if (mounted) {
            setIsAdmin(Boolean(payload.isAdmin))
          }
        }
      } else if (mounted) {
        setIsAdmin(false)
        setAvatarUrl(null)
      }
    }

    void loadUser()

    return () => {
      mounted = false
    }
  }, [session, user])

  return (
    <header className="border-b border-cyan-950/70 bg-black/85 backdrop-blur">

      <nav className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
        <ChibaskoLogo />

        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-[0.18em] text-zinc-300">
          <Link href="/" className="rounded-full border border-transparent px-4 py-2 hover:border-cyan-900 hover:text-cyan-300 transition-colors">
            Accueil
          </Link>
          <Link href="/games" className="rounded-full border border-transparent px-4 py-2 hover:border-cyan-900 hover:text-cyan-300 transition-colors">
            Jeux
          </Link>
          <Link href="/players" className="rounded-full border border-transparent px-4 py-2 hover:border-cyan-900 hover:text-cyan-300 transition-colors">
            Communaute
          </Link>
          {user ? (
            <>
              <Link href="/favorites" className="rounded-full border border-transparent px-4 py-2 hover:border-cyan-900 hover:text-cyan-300 transition-colors">
                Favoris
              </Link>
              {isAdmin ? (
                <Link href="/admin" className="rounded-full border border-cyan-700/70 px-4 py-2 text-cyan-300 hover:bg-zinc-900 transition-colors">
                  Admin
                </Link>
              ) : null}
              <UserDropdown user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
            </>
          ) : loading ? (
            <div className="h-10 w-32 rounded-full border border-zinc-800 bg-zinc-950 animate-pulse" />
          ) : (
            <>
              <Link href="/register" className="rounded-full border border-cyan-700/60 px-4 py-2 text-cyan-300 hover:bg-zinc-900 transition-colors">
                Inscription
              </Link>
              <Link href="/login" className="rounded-full bg-cyan-400 px-4 py-2 text-black hover:bg-cyan-300 transition-colors">
                Connexion
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  )
}

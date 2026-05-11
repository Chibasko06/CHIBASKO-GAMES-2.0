"use client";

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabaseClient'
import UserDropdown from '@/components/UserDropdown'
import ChibaskoLogo from '@/components/ChibaskoLogo'

const sharedLinkClass =
  'rounded-full border border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors hover:border-cyan-900 hover:text-cyan-300 sm:px-4 sm:text-sm'

export function Navbar() {
  const { user, session, loading } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  const handleCloseMobileMenu = () => {
    setMobileMenuOpen(false)
  }

  return (
    <header className="border-b border-cyan-950/70 bg-black/85 backdrop-blur">
      <nav className="mx-auto w-full max-w-[2200px] px-4 py-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex items-center justify-between gap-4">
          <ChibaskoLogo />

          <div className="hidden items-center gap-2 text-zinc-300 lg:flex xl:gap-3">
            <Link href="/" className={sharedLinkClass}>
              Accueil
            </Link>
            <Link href="/games" className={sharedLinkClass}>
              Jeux
            </Link>
            <Link href="/players" className={sharedLinkClass}>
              Communaute
            </Link>
            {user ? (
              <>
                <Link href="/favorites" className={sharedLinkClass}>
                  Favoris
                </Link>
                {isAdmin ? (
                  <Link href="/admin" className="rounded-full border border-cyan-700/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-300 transition-colors hover:bg-zinc-900">
                    Admin
                  </Link>
                ) : null}
                <UserDropdown user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
              </>
            ) : loading ? (
              <div className="h-10 w-32 animate-pulse rounded-full border border-zinc-800 bg-zinc-950" />
            ) : (
              <>
                <Link href="/register" className="rounded-full border border-cyan-700/60 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-300 transition-colors hover:bg-zinc-900">
                  Inscription
                </Link>
                <Link href="/login" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-black transition-colors hover:bg-cyan-300">
                  Connexion
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-cyan-900 bg-zinc-950 text-cyan-200 transition-colors hover:bg-zinc-900 lg:hidden"
            aria-expanded={mobileMenuOpen}
            aria-label="Ouvrir le menu"
          >
            {mobileMenuOpen ? (
              <span className="relative block h-[14px] w-[14px]">
                <span className="absolute left-1/2 top-1/2 h-0.5 w-[14px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                <span className="absolute left-1/2 top-1/2 h-0.5 w-[14px] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
              </span>
            ) : (
              <span className="relative block h-[14px] w-[16px]">
                <span className="absolute left-1/2 top-[1px] h-0.5 w-[16px] -translate-x-1/2 rounded-full bg-current" />
                <span className="absolute left-1/2 top-1/2 h-0.5 w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                <span className="absolute left-1/2 bottom-[1px] h-0.5 w-[16px] -translate-x-1/2 rounded-full bg-current" />
              </span>
            )}
          </button>
        </div>

        {mobileMenuOpen ? (
          <div className="mt-4 rounded-[24px] border border-zinc-800 bg-zinc-950/95 p-4 lg:hidden">
            <div className="grid gap-2 text-zinc-200">
            <Link href="/" onClick={handleCloseMobileMenu} className="rounded-2xl border border-zinc-800 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em]">
              Accueil
            </Link>
            <Link href="/games" onClick={handleCloseMobileMenu} className="rounded-2xl border border-zinc-800 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em]">
              Jeux
            </Link>
            <Link href="/players" onClick={handleCloseMobileMenu} className="rounded-2xl border border-zinc-800 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em]">
              Communaute
            </Link>
            {user ? (
              <>
                  <Link href="/favorites" onClick={handleCloseMobileMenu} className="rounded-2xl border border-zinc-800 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em]">
                    Favoris
                  </Link>
                  <Link href="/dashboard" onClick={handleCloseMobileMenu} className="rounded-2xl border border-zinc-800 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em]">
                    Dashboard
                  </Link>
                  {isAdmin ? (
                    <Link href="/admin" onClick={handleCloseMobileMenu} className="rounded-2xl border border-cyan-800 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-cyan-300">
                      Admin
                    </Link>
                  ) : null}
                  <div className="rounded-[22px] border border-zinc-800 bg-black/30 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-cyan-700 bg-cyan-600 text-xs font-black text-black">
                        {avatarUrl ? (
                          <Image
                            src={avatarUrl}
                            alt="Avatar compte"
                            width={40}
                            height={40}
                            unoptimized
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          user.email?.[0]?.toUpperCase() ?? 'J'
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black uppercase tracking-[0.14em] text-white">Mon compte</p>
                        <p className="truncate text-xs text-zinc-500">{user.email}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="mt-4 w-full rounded-2xl border border-red-950 px-4 py-3 text-left text-sm font-bold uppercase tracking-[0.14em] text-red-400"
                    >
                      Deconnexion
                    </button>
                  </div>
                </>
              ) : loading ? (
                <div className="h-12 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
              ) : (
                <div className="grid gap-2">
                  <Link href="/register" onClick={handleCloseMobileMenu} className="rounded-2xl border border-cyan-700/60 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-cyan-300">
                    Inscription
                  </Link>
                  <Link href="/login" onClick={handleCloseMobileMenu} className="rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-bold uppercase tracking-[0.14em] text-black">
                    Connexion
                  </Link>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </nav>
    </header>
  )
}

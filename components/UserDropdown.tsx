"use client";

import Image from 'next/image'
import { useState } from 'react'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export default function UserDropdown({
  user,
  isAdmin,
  avatarUrl,
}: {
  user: User
  isAdmin: boolean
  avatarUrl?: string | null
}) {
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-full bg-zinc-900 border border-cyan-900 px-3 py-1 hover:bg-zinc-800 transition"
      >
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-cyan-700 bg-cyan-600 text-[10px] font-black text-black">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt="Avatar compte"
              width={32}
              height={32}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            user.email?.[0]?.toUpperCase() ?? 'J'
          )}
        </div>
        <span className="text-[10px] font-bold text-white uppercase hidden md:block">
          Mon Compte
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-zinc-950 border border-cyan-900 shadow-[0_10px_20px_rgba(0,0,0,0.5)] z-50">
          <Link
            href="/dashboard"
            className="block px-4 py-2 text-xs font-bold text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 border-b border-zinc-900"
            onClick={() => setOpen(false)}
          >
            TABLEAU DE BORD
          </Link>
          <Link
            href="/favorites"
            className="block px-4 py-2 text-xs font-bold text-zinc-400 hover:text-cyan-400 hover:bg-zinc-900 border-b border-zinc-900"
            onClick={() => setOpen(false)}
          >
            MES FAVORIS
          </Link>
          {isAdmin ? (
            <Link
              href="/admin"
              className="block px-4 py-2 text-xs font-bold text-cyan-300 hover:text-cyan-200 hover:bg-zinc-900 border-b border-zinc-900"
              onClick={() => setOpen(false)}
            >
              ESPACE ADMIN
            </Link>
          ) : null}
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2 text-xs font-bold text-red-500 hover:bg-zinc-900"
          >
            DECONNEXION
          </button>
        </div>
      )}
    </div>
  )
}

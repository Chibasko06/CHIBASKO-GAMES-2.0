"use client";

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { GameCard } from '@/components/GameCard'
import { getFavoriteGames } from '@/lib/queries/favorites'
import { ensureProfile } from '@/lib/profileSync'
import { Tables } from '@/types/database'

type Game = Tables<'games'>

export default function FavoritesPage() {
  const pathname = usePathname()
  const { loading: authLoading, user } = useAuth()
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    let mounted = true

    const loadFavorites = async () => {
      const requestId = ++requestIdRef.current

      if (!user) {
        if (mounted && requestId === requestIdRef.current) {
          setNeedsAuth(!authLoading)
          setLoading(authLoading)
        }
        return
      }

      await ensureProfile()
      const favoriteEntries = await getFavoriteGames(user.id)

      if (mounted && requestId === requestIdRef.current) {
        setNeedsAuth(false)
        setGames(favoriteEntries.map((entry) => entry.game))
        setLoading(false)
      }
    }

    const handleFavoritesUpdate = () => {
      void loadFavorites()
    }

    const handleFocus = () => {
      void loadFavorites()
    }

    void loadFavorites()
    window.addEventListener('favorites-updated', handleFavoritesUpdate)
    window.addEventListener('focus', handleFocus)

    return () => {
      mounted = false
      window.removeEventListener('favorites-updated', handleFavoritesUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [authLoading, pathname, user])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Mes favoris</h1>
        <p className="text-zinc-500">
          Les jeux que tu as mis de cote pour les retrouver rapidement.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-64 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse" />
          ))}
        </div>
      ) : needsAuth ? (
        <div className="border border-zinc-800 bg-zinc-950 p-6 space-y-4">
          <p className="text-zinc-300">
            Connecte-toi pour acceder a ta liste de favoris.
          </p>
          <div className="flex gap-4">
            <Link href="/login" className="bg-cyan-600 px-4 py-2 font-bold text-black">
              Connexion
            </Link>
            <Link href="/register" className="border border-cyan-700 px-4 py-2 font-bold text-white">
              Inscription
            </Link>
          </div>
        </div>
      ) : games.length === 0 ? (
        <div className="border border-zinc-800 bg-zinc-950 p-6">
          <p className="text-zinc-300">
            Aucun favori pour le moment. Ajoute des jeux depuis leur page detail.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Jeux sauvegardes</p>
              <p className="text-3xl font-black text-cyan-400">{games.length}</p>
            </div>
            <div className="border border-zinc-800 bg-zinc-950 p-4 sm:col-span-2">
              <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mb-2">Dernier ajout</p>
              <p className="text-lg font-black text-white">{games[0]?.title}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

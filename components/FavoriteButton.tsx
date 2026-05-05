"use client";

import { useEffect, useRef, useState } from 'react'
import { addFavorite, isFavorite, removeFavorite } from '@/lib/queries/favorites'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

type Props = {
  gameId: string
}

export default function FavoriteButton({ gameId }: Props) {
  const [isGameFavorite, setIsGameFavorite] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    let mounted = true

    const checkFavorite = async () => {
      const requestId = ++requestIdRef.current
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!mounted || requestId !== requestIdRef.current) {
        return
      }

      if (!user) {
        setUserId(null)
        setIsGameFavorite(false)
        setLoading(false)
        return
      }

      await ensureProfile()
      const favorite = await isFavorite(user.id, gameId)

      if (!mounted || requestId !== requestIdRef.current) {
        return
      }

      setUserId(user.id)
      setIsGameFavorite(favorite)
      setLoading(false)
    }

    void checkFavorite()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkFavorite()
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [gameId])

  const notifyFavoriteChange = (favorite: boolean) => {
    window.dispatchEvent(
      new CustomEvent('favorites-updated', {
        detail: { gameId, favorite },
      })
    )
  }

  const toggleFavorite = async () => {
    if (pending) {
      return
    }

    if (!userId) {
      alert('Connecte-toi pour ajouter ce jeu en favori.')
      return
    }

    setPending(true)
    const previousValue = isGameFavorite
    const nextValue = !previousValue
    setIsGameFavorite(nextValue)

    const profileSync = await ensureProfile()

    if (!profileSync.ok) {
      setIsGameFavorite(previousValue)
      alert('Impossible de preparer ton profil joueur pour les favoris.')
      setPending(false)
      return
    }

    if (isGameFavorite) {
      const { error } = await removeFavorite(userId, gameId)

      if (error) {
        setIsGameFavorite(previousValue)
        alert(error.message)
      } else {
        notifyFavoriteChange(false)
      }
    } else {
      const { error } = await addFavorite(userId, gameId)

      if (error) {
        setIsGameFavorite(previousValue)
        alert(error.message)
      } else {
        notifyFavoriteChange(true)
      }
    }

    setPending(false)
  }

  if (loading) {
    return <div className="w-10 h-10 bg-zinc-900 animate-pulse border border-zinc-800" />
  }

  return (
    <button
      onClick={toggleFavorite}
      disabled={pending}
      className={`p-2 border transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
        isGameFavorite
          ? 'bg-cyan-500 border-cyan-400 text-black'
          : 'bg-transparent border-zinc-700 text-zinc-500 hover:border-cyan-500'
      }`}
      title={isGameFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill={isGameFavorite ? 'currentColor' : 'none'}
        stroke="currentColor"
        className="w-6 h-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.921-.755 1.688-1.54 1.118l-3.976-2.888a1 1 0 00-1.175 0l-3.976 2.888c-.784.57-1.838-.197-1.539-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    </button>
  )
}

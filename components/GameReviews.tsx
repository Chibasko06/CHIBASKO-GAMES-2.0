"use client";

import { useEffect, useRef, useState } from 'react'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

type Review = {
  id: string
  user_id: string
  username: string
  avatar_url: string | null
  rating: number
  comment: string
  created_at: string
  updated_at: string
}

type Props = {
  gameId: string
}

export default function GameReviews({ gameId }: Props) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const requestIdRef = useRef(0)

  useEffect(() => {
    let mounted = true

    const loadReviews = async () => {
      const requestId = ++requestIdRef.current
      const { data } = await supabase.rpc('get_game_reviews', {
        p_game_id: gameId,
      })

      if (!mounted || requestId !== requestIdRef.current) {
        return
      }

      setReviews((data as Review[] | null) ?? [])
      setLoading(false)
    }

    void loadReviews()

    const handleFocus = () => {
      void loadReviews()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      mounted = false
      window.removeEventListener('focus', handleFocus)
    }
  }, [gameId])

  const averageRating = reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    : 0

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (submitting) {
      return
    }

    setMessage(null)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setNeedsAuth(true)
      setMessage('Connecte-toi pour laisser un commentaire.')
      return
    }

    if (!comment.trim()) {
      setMessage('Ecris un commentaire avant de publier.')
      return
    }

    setSubmitting(true)
    const profileSync = await ensureProfile()

    if (!profileSync.ok) {
      setMessage('Impossible de preparer ton profil pour publier le commentaire.')
      setSubmitting(false)
      return
    }

    const { error } = await supabase
      .from('game_reviews')
      .upsert(
        {
          game_id: gameId,
          user_id: user.id,
          rating,
          comment: comment.trim(),
        },
        {
          onConflict: 'user_id,game_id',
        }
      )

    if (error) {
      if (error.message.includes("could not find the table 'public.game_reviews'")) {
        setMessage('La table des commentaires n existe pas encore dans Supabase. Applique la migration des reviews puis reessaie.')
      } else {
        setMessage(error.message)
      }
      setSubmitting(false)
      return
    }

    const requestId = ++requestIdRef.current
    const { data } = await supabase.rpc('get_game_reviews', {
      p_game_id: gameId,
    })

    if (requestId === requestIdRef.current) {
      setReviews((data as Review[] | null) ?? [])
    }
    setComment('')
    setRating(5)
    setNeedsAuth(false)
    setMessage('Ton avis a ete publie.')
    setSubmitting(false)
  }

  return (
    <section className="space-y-6 rounded-[24px] border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase text-white">Commentaires</h2>
          <p className="text-sm text-zinc-400">
            {reviews.length} avis publics • note moyenne {averageRating ? averageRating.toFixed(1) : '0.0'} / 5
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-[20px] border border-zinc-800 bg-black/30 p-4">
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                value <= rating
                  ? 'bg-cyan-400 text-black'
                  : 'border border-zinc-700 text-zinc-300 hover:border-cyan-700'
              }`}
            >
              {value}★
            </button>
          ))}
        </div>

        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Ton avis sur le jeu..."
          className="min-h-32 w-full rounded-2xl border border-zinc-800 bg-black/50 p-4 text-white outline-none focus:border-cyan-500"
        />

        {message ? (
          <p className="text-sm text-cyan-300">{message}</p>
        ) : null}
        {needsAuth ? (
          <p className="text-sm text-zinc-500">La lecture est publique, mais il faut un compte pour commenter.</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Publication...' : 'Publier mon avis'}
        </button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-black/20 p-6 text-sm text-zinc-400">
          Aucun commentaire pour le moment. Sois le premier a noter ce jeu.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-zinc-800 bg-black/20 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-cyan-700 bg-zinc-900">
                  {review.avatar_url ? (
                    <img src={review.avatar_url} alt={review.username} className="h-full w-full object-cover" />
                  ) : (
                    <span className="font-black text-cyan-300">{review.username[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-bold text-white">{review.username}</p>
                    <p className="text-sm text-cyan-300">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(review.updated_at || review.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{review.comment}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

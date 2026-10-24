"use client";

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { ensureProfile } from '@/lib/profileSync'
import {getGameReviewsPage} from '@/lib/queries/games'
import {useMutationRecovery} from '@/lib/useMutationRecovery'
import { supabase } from '@/lib/supabaseClient'
import FormField from '@/components/ui/FormField'

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
  const { session, user } = useAuth()
  const [reviews, setReviews] = useState<Review[]>([])
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[averageRating,setAverageRating]=useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const {pending: submitting, blocked, mutate, check} = useMutationRecovery(gameId + ':' + (user?.id ?? ''))
  const [needsAuth, setNeedsAuth] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const refreshReviews = async (clearFeedback = true) => {
    const result = await check(async current => {
      const data = await getGameReviewsPage(gameId,page)
      if (!current()) return
      setReviews(data.items as Review[])
      setTotal(data.total);setAverageRating(data.average)
      setLoadError(false)
    })
    if (result === 'failed') setLoadError(true)
    if (result === 'ready' && clearFeedback) setMessage(null)
    if (result === 'waiting') setMessage('La modification reste en attente de confirmation. Vérifie les avis avant de recommencer.')
    if (result !== 'stale') setLoading(false)
    return result
  }

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void refreshReviews() })
    const handleFocus = () => { void refreshReviews() }
    window.addEventListener('focus', handleFocus)
    return () => { active = false; window.removeEventListener('focus', handleFocus) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, user?.id,page])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (submitting) {
      return
    }

    if (blocked) { await refreshReviews(); return }
    setMessage(null)

    if (!user) {
      setNeedsAuth(true)
      setMessage('Connecte-toi pour laisser un commentaire.')
      return
    }

    if (!comment.trim()) {
      setMessage('Ecris un commentaire avant de publier.')
      return
    }

    const outcome = await mutate(async current => {
      const profileSync = await ensureProfile(session)
      if (!current()) return
      if (!profileSync.ok) throw new Error('profile_unavailable')
      const {error} = await supabase.from('game_reviews').upsert({
        game_id: gameId, user_id: user.id, rating, comment: comment.trim(),
      }, {onConflict: 'user_id,game_id'})
      if (error) throw new Error('review_write_unconfirmed')
    })
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'unconfirmed') {
      setMessage('La publication de l’avis n’a pas pu être confirmée. Vérifie les avis avant de réessayer.')
      await refreshReviews(false)
      return
    }
    setComment('')
    setRating(5)
    setNeedsAuth(false)
    setMessage('Ton avis a été publié.')
    await refreshReviews(false)
  }

  const handleDelete = async (reviewId: string) => {
    if (!user || submitting) return
    if (blocked) { await refreshReviews(); return }
    if (!window.confirm('Confirmer la suppression de ton commentaire ?\n\nCette action est irreversible.')) return
    setMessage(null)
    const outcome = await mutate(async () => {
      const {error} = await supabase.from('game_reviews').delete().eq('id', reviewId).eq('user_id', user.id)
      if (error) throw new Error('review_delete_unconfirmed')
    })
    if (outcome.kind === 'stale') return
    setMessage(outcome.kind === 'confirmed' ? 'Ton commentaire a été supprimé.'
      : 'La suppression n’a pas pu être confirmée. Vérifie les avis avant de réessayer.')
    await refreshReviews(false)
  }

  return (
    <section className="space-y-6 rounded-[24px] border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase text-white">Commentaires</h2>
          <p className="text-sm text-zinc-400">
            {loadError ? 'Avis temporairement indisponibles' : total + ' avis publics • note moyenne ' + (averageRating ? averageRating.toFixed(1) : '0.0') + ' / 5'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-[20px] border border-zinc-800 bg-black/30 p-4">
        <fieldset className="space-y-2" disabled={submitting}>
        <legend className="text-sm font-semibold text-zinc-300">Ta note sur 5</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className={`relative cursor-pointer rounded-full px-4 py-2 text-sm font-bold transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cyan-300 ${
                value <= rating
                  ? 'bg-cyan-400 text-black'
                  : 'border border-zinc-700 text-zinc-300 hover:border-cyan-700'
              }`}
            >
              <input type="radio" name="rating" value={value} checked={rating===value} onChange={()=>setRating(value)} aria-label={`${value} sur 5`} className="sr-only"/>
              <span aria-hidden="true">{value}★</span>
            </label>
          ))}
        </div>
        </fieldset>

        <FormField label="Ton commentaire" descriptionId="review-feedback">
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Ton avis sur le jeu..."
          className="min-h-32 w-full rounded-2xl border border-zinc-800 bg-black/50 p-4 text-white outline-none focus:border-cyan-500"
        />
        </FormField>

        {message ? (
          <p id="review-feedback" role="status" className="text-sm text-cyan-300">{message}</p>
        ) : null}
        {needsAuth ? (
          <p className="text-sm text-zinc-500">La lecture est publique, mais il faut un compte pour commenter.</p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-black disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Vérification...' : blocked ? 'Vérifier les avis' : 'Publier mon avis'}
        </button>
      </form>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      ) : loadError ? (
        <p role="alert">Impossible de charger les avis. <button type="button" className="text-cyan-300 underline" disabled={submitting} onClick={() => {void refreshReviews()}}>Réessayer</button></p>
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
                    <Image
                      src={review.avatar_url}
                      alt={review.username}
                      width={44}
                      height={44}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-black text-cyan-300">{review.username[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-bold text-white">{review.username}</p>
                    <p className="text-sm text-cyan-300" aria-label={`${review.rating} sur 5`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(review.updated_at || review.created_at).toLocaleString('fr-FR')}
                    </p>
                    {user?.id === review.user_id ? (
                      <button
                        type="button"
                        onClick={() => void handleDelete(review.id)}
                        disabled={submitting}
                        className="ml-auto rounded-full border border-red-900 px-3 py-1 text-xs font-bold text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Supprimer mon commentaire"
                        aria-label="Supprimer mon commentaire"
                      >
                        🗑
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-300">{review.comment}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <nav aria-label="Pages des avis" className="flex justify-center gap-6"><button disabled={submitting||page===1} onClick={()=>setPage(p=>p-1)}>Précédent</button><span>Page {page}</span><button disabled={submitting||page*20>=total} onClick={()=>setPage(p=>p+1)}>Suivant</button></nav>
    </section>
  )
}

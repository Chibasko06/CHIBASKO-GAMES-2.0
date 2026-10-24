'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { ensureProfile } from '@/lib/profileSync'
import {readData} from '@/lib/dataAccess'
import {getGamePublicStats} from '@/lib/queries/games'
import {useMutationRecovery} from '@/lib/useMutationRecovery'
import { supabase } from '@/lib/supabaseClient'
import PlayerIcon from './game-runtime/PlayerIcon'
import playerStyles from './game-runtime/GameRuntime.module.css'

type Reaction = 'like' | 'dislike' | null
export default function GameReactions({ gameId, initialLikes, initialDislikes, compact=false }: { gameId: string; initialLikes: number; initialDislikes: number; compact?:boolean }) {
  const { session, user } = useAuth()
  const [likes, setLikes] = useState(initialLikes)
  const [dislikes, setDislikes] = useState(initialDislikes)
  const [reaction, setReaction] = useState<Reaction>(null)
  const [loadError, setLoadError] = useState(false)
  const [countsError, setCountsError] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const {pending, blocked, mutate, check} = useMutationRecovery(gameId + ':' + (user?.id ?? ''))

  const reloadReaction = async (clearFeedback = true) => {
    let diagnosed = false
    const result = await check(async current => {
      const [personal, counts] = await Promise.allSettled([
        user ? readData('game_reaction', supabase.from('game_reactions').select('reaction')
          .eq('game_id', gameId).eq('user_id', user.id).maybeSingle()) : Promise.resolve({data: null}),
        getGamePublicStats(gameId),
      ])
      if (!current()) return
      diagnosed = true
      setLoadError(personal.status === 'rejected')
      setCountsError(counts.status === 'rejected')
      if (personal.status === 'fulfilled') setReaction((personal.value.data?.reaction as Reaction) ?? null)
      if (counts.status === 'fulfilled') {
        const stats = counts.value.find(entry => entry.game_id === gameId)
        setLikes(Number(stats?.likes_count ?? 0))
        setDislikes(Number(stats?.dislikes_count ?? 0))
      }
      if (personal.status === 'rejected' || counts.status === 'rejected') throw new Error('reaction_refresh_failed')
    })
    if (result === 'ready' && clearFeedback) setMessage(null)
    if (result === 'failed' && !diagnosed) { setLoadError(true); setCountsError(true) }
    if (result === 'waiting') setMessage('La modification reste en attente de confirmation. Vérifie son état avant de recommencer.')
    return result
  }

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void reloadReaction() })
    return () => { active = false }
    // The recovery guard invalidates reads and writes when the game or account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, user?.id])

  const applyReaction = async (nextReaction: Exclude<Reaction, null>) => {
    if (pending) return
    if (blocked) { await reloadReaction(); return }
    if (!user) { setMessage('Connecte-toi pour liker ou disliker un jeu.'); return }
    const target = reaction === nextReaction ? null : nextReaction
    const previous = reaction
    setMessage(null)
    const outcome = await mutate(async current => {
      const profileSync = await ensureProfile(session)
      if (!current()) return
      if (!profileSync.ok) throw new Error('profile_unavailable')
      const result = target === null
        ? await supabase.from('game_reactions').delete().eq('game_id', gameId).eq('user_id', user.id)
        : await supabase.from('game_reactions').upsert({game_id: gameId, user_id: user.id, reaction: target}, {onConflict: 'user_id,game_id'})
      if (result.error) throw new Error('reaction_write_unconfirmed')
    })
    if (outcome.kind === 'stale') return
    if (outcome.kind === 'unconfirmed') {
      setMessage('La modification de la réaction n’a pas pu être confirmée. Vérifie son état avant de réessayer.')
      await reloadReaction(false)
      return
    }
    setReaction(target)
    setLikes(value => Math.max(0, value - (previous === 'like' ? 1 : 0) + (target === 'like' ? 1 : 0)))
    setDislikes(value => Math.max(0, value - (previous === 'dislike' ? 1 : 0) + (target === 'dislike' ? 1 : 0)))
    await reloadReaction()
  }

  const feedback = message || (loadError ? 'Réactions indisponibles. Clique pour vérifier leur état.'
    : countsError ? 'Compteurs indisponibles. Clique pour les actualiser.' : null)
  const label = (value: 'like' | 'dislike') => feedback || (value === 'like' ? 'J’aime · ' + likes : 'Je n’aime pas · ' + dislikes)

  if(compact)return <div className={playerStyles.reactionButtons}>
    {feedback && <span role="status" className="sr-only">{feedback}</span>}
    {(['like','dislike'] as const).map(value=><button key={value} className={playerStyles.iconButton} type="button" aria-label={value==='like'?'J’aime':'Je n’aime pas'} aria-pressed={loadError ? undefined : reaction===value} title={label(value)} disabled={pending} onClick={()=>void applyReaction(value)}><PlayerIcon name={value}/><span className={playerStyles.tooltip} aria-hidden="true">{label(value)}</span></button>)}
  </div>

  return (
        <div className="flex flex-wrap items-center gap-2">
          {feedback && <p role="status">{feedback}</p>}
          <button
            type="button"
            aria-label="J’aime"
            disabled={pending}
            aria-pressed={loadError ? undefined : reaction === 'like'}
            title={label('like')}
            onClick={() => void applyReaction('like')}
            className={`rounded-full border px-3 py-2 text-sm font-bold transition sm:px-4 ${
              reaction === 'like'
                ? 'border-cyan-400 bg-cyan-400 text-black'
                : 'border-zinc-700 text-zinc-200 hover:border-cyan-700'
            }`}
          >
            👍 {likes}
          </button>
          <button
            type="button"
            aria-label="Je n’aime pas"
            disabled={pending}
            aria-pressed={loadError ? undefined : reaction === 'dislike'}
            title={label('dislike')}
            onClick={() => void applyReaction('dislike')}
            className={`rounded-full border px-3 py-2 text-sm font-bold transition sm:px-4 ${
              reaction === 'dislike'
                ? 'border-red-400 bg-red-400 text-black'
                : 'border-zinc-700 text-zinc-200 hover:border-red-700'
            }`}
          >
            👎 {dislikes}
          </button>
        </div>
  )
}

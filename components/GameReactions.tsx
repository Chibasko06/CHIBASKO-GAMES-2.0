'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { ensureProfile } from '@/lib/profileSync'
import { supabase } from '@/lib/supabaseClient'

type Reaction = 'like' | 'dislike' | null
export default function GameReactions({ gameId, initialLikes, initialDislikes }: { gameId: string; initialLikes: number; initialDislikes: number }) {
  const { session, user } = useAuth()
  const [likes, setLikes] = useState(initialLikes)
  const [dislikes, setDislikes] = useState(initialDislikes)
  const [reaction, setReaction] = useState<Reaction>(null)
  const [pending, setPending] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    let mounted = true

    const loadReaction = async () => {
      if (!user) {
        if (mounted) {
          setReaction(null)
        }
        return
      }

      const { data } = await supabase
        .from('game_reactions')
        .select('reaction')
        .eq('game_id', gameId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (mounted) {
        setReaction((data?.reaction as Reaction) ?? null)
      }
    }

    void loadReaction()

    return () => {
      mounted = false
    }
  }, [gameId, user])

  const syncCounts = async () => {
    const requestId = ++requestIdRef.current
    const { data } = await supabase.rpc('get_game_public_stats')
    const gameStats = (data as Array<{ game_id: string; likes_count: number; dislikes_count: number }> | null)
      ?.find((entry) => entry.game_id === gameId)

    if (requestId !== requestIdRef.current) {
      return
    }

    setLikes(Number(gameStats?.likes_count ?? 0))
    setDislikes(Number(gameStats?.dislikes_count ?? 0))
  }

  const applyReaction = async (nextReaction: Exclude<Reaction, null>) => {
    if (pending) {
      return
    }

    if (!user) {
      alert('Connecte-toi pour liker ou disliker un jeu.')
      return
    }

    setPending(true)
    const previousReaction = reaction
    const previousLikes = likes
    const previousDislikes = dislikes
    const profileSync = await ensureProfile(session)

    if (!profileSync.ok) {
      setPending(false)
      return
    }

    if (reaction === nextReaction) {
      setReaction(null)
      setLikes((current) => nextReaction === 'like' ? Math.max(current - 1, 0) : current)
      setDislikes((current) => nextReaction === 'dislike' ? Math.max(current - 1, 0) : current)

      const { error } = await supabase
        .from('game_reactions')
        .delete()
        .eq('game_id', gameId)
        .eq('user_id', user.id)

      if (error) {
        setReaction(previousReaction)
        setLikes(previousLikes)
        setDislikes(previousDislikes)
        setPending(false)
        return
      }
    } else {
      setReaction(nextReaction)
      setLikes((current) => {
        const removed = previousReaction === 'like' ? 1 : 0
        const added = nextReaction === 'like' ? 1 : 0
        return Math.max(current - removed + added, 0)
      })
      setDislikes((current) => {
        const removed = previousReaction === 'dislike' ? 1 : 0
        const added = nextReaction === 'dislike' ? 1 : 0
        return Math.max(current - removed + added, 0)
      })

      const { error } = await supabase
        .from('game_reactions')
        .upsert(
          {
            game_id: gameId,
            user_id: user.id,
            reaction: nextReaction,
          },
          {
            onConflict: 'user_id,game_id',
          }
        )

      if (error) {
        setReaction(previousReaction)
        setLikes(previousLikes)
        setDislikes(previousDislikes)
        setPending(false)
        return
      }
    }

    await syncCounts()
    setPending(false)
  }


  return (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
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
            disabled={pending}
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

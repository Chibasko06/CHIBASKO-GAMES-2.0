'use client'
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { supabase } from '@/lib/supabaseClient'
import { createProductSession, gameServerOrigin } from '@/lib/multiplayer/productSession'
type Controller = ReturnType<typeof createProductSession>
const Context = createContext<{ controller: Controller; available: boolean } | null>(null)
export function MultiplayerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const pathname = usePathname()
  const [value] = useState(() => {
    const endpoint = gameServerOrigin()
    return { available: !!endpoint, controller: createProductSession({ endpoint,
      getSession: async () => (await supabase.auth.getSession()).data.session,
      catalogue: async gameId => {
        const { data, error } = await supabase.from('games').select('slug,multiplayer_game_id').eq('is_published', true).eq('game_type', 'multiplayer_chibasko').eq('multiplayer_game_id', gameId).abortSignal(AbortSignal.timeout(10000)).maybeSingle()
        return !error && data?.multiplayer_game_id ? { slug: data.slug, gameId: data.multiplayer_game_id } : null
      },
    }) }
  })
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => value.controller.accountChanged(session?.user.id ?? null))
    return () => { subscription.unsubscribe(); value.controller.disconnect() }
  }, [value])
  useEffect(() => { value.controller.accountChanged(user?.id ?? null) }, [user?.id, value])
  useEffect(() => { value.controller.navigate(pathname) }, [pathname, value])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useMultiplayer() {
  const context = useContext(Context)
  if (!context) throw new Error('MultiplayerProvider required')
  const state = useSyncExternalStore(context.controller.subscribe, context.controller.getSnapshot, context.controller.getSnapshot)
  return { ...context, state }
}

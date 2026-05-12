"use client";

import { useState } from 'react'
import type { Provider } from '@supabase/supabase-js'
import { getOAuthRedirectUrl } from '@/lib/authRedirect'
import { supabase } from '@/lib/supabaseClient'

type SocialProvider = 'google' | 'discord'

const providerLabels: Record<SocialProvider, string> = {
  google: 'Continuer avec Google',
  discord: 'Continuer avec Discord',
}

const providerBadges: Record<SocialProvider, string> = {
  google: 'G',
  discord: 'D',
}

const providerScopes: Partial<Record<SocialProvider, string>> = {
  google: 'email profile',
  discord: 'identify email',
}

export default function SocialAuthButtons({
  nextPath = '/',
  onError,
}: {
  nextPath?: string
  onError?: (message: string) => void
}) {
  const [loadingProvider, setLoadingProvider] = useState<SocialProvider | null>(null)

  const handleOAuth = async (provider: SocialProvider) => {
    setLoadingProvider(provider)
    onError?.('')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: {
        redirectTo: getOAuthRedirectUrl(nextPath),
        scopes: providerScopes[provider],
      },
    })

    if (error) {
      onError?.(error.message)
      setLoadingProvider(null)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {(['google', 'discord'] as const).map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => void handleOAuth(provider)}
          disabled={loadingProvider !== null}
          className="flex items-center justify-center gap-3 rounded-2xl border border-zinc-800 bg-black/45 px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:border-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-800 text-xs text-cyan-300">
            {providerBadges[provider]}
          </span>
          <span>
            {loadingProvider === provider ? 'Redirection...' : providerLabels[provider]}
          </span>
        </button>
      ))}
    </div>
  )
}

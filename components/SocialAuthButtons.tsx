"use client";

import { useState } from 'react'
import { getOAuthRedirectUrl } from '@/lib/authRedirect'
import { supabase } from '@/lib/supabaseClient'

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
      <path
        fill="#EA4335"
        d="M12 10.2v3.94h5.48c-.24 1.27-.96 2.35-2.04 3.08l3.3 2.56c1.92-1.77 3.03-4.37 3.03-7.45 0-.73-.07-1.44-.19-2.12H12Z"
      />
      <path
        fill="#4285F4"
        d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.3-2.56c-.92.62-2.09 1-3.31 1-2.54 0-4.69-1.71-5.46-4.01H3.13v2.62A9.99 9.99 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.54 13.99A5.99 5.99 0 0 1 6.24 12c0-.69.12-1.36.3-1.99V7.39H3.13A9.99 9.99 0 0 0 2 12c0 1.61.39 3.13 1.13 4.61l3.41-2.62Z"
      />
      <path
        fill="#34A853"
        d="M12 6c1.47 0 2.79.51 3.83 1.51l2.87-2.87C16.95 2.99 14.69 2 12 2A9.99 9.99 0 0 0 3.13 7.39l3.41 2.62C7.31 7.71 9.46 6 12 6Z"
      />
    </svg>
  )
}

export default function SocialAuthButtons({
  nextPath = '/',
  onError,
}: {
  nextPath?: string
  onError?: (message: string) => void
}) {
  const [loading, setLoading] = useState(false)

  const handleGoogle = async () => {
    setLoading(true)
    onError?.('')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getOAuthRedirectUrl(nextPath),
        scopes: 'email profile',
      },
    })

    if (error) {
      onError?.(error.message)
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleGoogle()}
      disabled={loading}
      className="flex w-full items-center justify-center gap-4 rounded-full border border-zinc-200 bg-white px-6 py-4 text-base font-medium text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.2)] transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <GoogleMark />
      <span>{loading ? 'Redirection vers Google...' : 'Se connecter avec Google'}</span>
    </button>
  )
}

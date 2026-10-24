'use client'

import Link from 'next/link'

export default function ErrorPage({reset}: {reset: () => void}) {
  return <section role="alert" className="mx-auto max-w-xl space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
    <h1 className="text-2xl font-bold text-white">Contenu temporairement indisponible</h1>
    <p className="text-zinc-300">Chibasko Games ne peut pas charger ces données pour le moment. Réessaie dans un instant.</p>
    <div className="flex flex-wrap gap-4">
      <button type="button" onClick={reset} className="rounded-lg bg-cyan-400 px-4 py-3 font-bold text-black">Réessayer</button>
      <Link href="/" className="rounded-lg border border-cyan-700 px-4 py-3 text-cyan-200">Retour à l’accueil</Link>
    </div>
  </section>
}

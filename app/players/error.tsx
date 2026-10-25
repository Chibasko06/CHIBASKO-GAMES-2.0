'use client'
export default function Error({ reset }: { reset: () => void }) {  
return <section role="alert" className="rounded-2xl border border-zinc-700 bg-zinc-950 p-6">
    <h1 className="text-xl font-bold">La communauté est temporairement indisponible</h1>
    <p className="mt-2 text-sm text-zinc-400">Les profils n’ont pas pu être chargés. Réessayez dans un instant.</p>
    <button onClick={reset} className="mt-4 rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-black">Réessayer</button>
  </section>
}

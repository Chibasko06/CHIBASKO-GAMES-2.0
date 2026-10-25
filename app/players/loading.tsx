export default function Loading() {
  return <div role="status" className="space-y-5">
    <h1 className="text-3xl font-bold">Communauté</h1>
    <p className="text-sm text-zinc-400">Chargement des membres…</p>
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) =>
      <div key={i} className="h-48 rounded-2xl border border-zinc-800 bg-zinc-950 motion-safe:animate-pulse" />)}</div>
  </div>
}

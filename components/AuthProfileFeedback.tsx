import Link from 'next/link'

export default function AuthProfileFeedback({loading, message, onRetry}: {loading: boolean; message: string | null; onRetry: () => void}) {
  return <section className="mx-auto max-w-md space-y-5 rounded-[28px] border border-cyan-950/80 bg-zinc-950 p-8 text-center">
    <h1 className="text-2xl font-bold text-white">Connexion à Chibasko Games</h1>
    <p role={message ? 'alert' : 'status'} className="text-sm text-zinc-300">{loading ? 'Préparation du profil…' : message}</p>
    {!loading && <div className="flex flex-wrap justify-center gap-4">
      <button type="button" onClick={onRetry} className="rounded-lg bg-cyan-400 px-4 py-3 font-bold text-black">Réessayer</button>
      <Link href="/login" className="text-cyan-300 underline">Retour à la connexion</Link>
      <Link href="/" className="text-cyan-300 underline">Accueil</Link>
    </div>}
  </section>
}

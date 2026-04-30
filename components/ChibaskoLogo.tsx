import Link from 'next/link'

type Props = {
  compact?: boolean
}

export default function ChibaskoLogo({ compact = false }: Props) {
  return (
    <Link href="/" className="inline-flex items-center gap-3 group">
      <img
        src="/logo-chibaskogames-rond.ico"
        alt="Logo ChibaskoGames"
        className="h-12 w-12 rounded-full border border-cyan-400/60 bg-black object-cover shadow-[0_0_24px_rgba(34,211,238,0.18)]"
      />
      <div className={compact ? 'hidden sm:block' : 'block'}>
        
        <p className="text-xl font-black uppercase tracking-tight text-white group-hover:text-cyan-300 transition-colors">
          Chibasko<span className="text-cyan-400">Games</span>
        </p>
        <p className="text-[10px] uppercase text-cyan-300/80">Un univers de jeux sans précédents !</p>
      </div>
    </Link>
  )
}

import Link from 'next/link'
import ChibaskoLogo from '@/components/ChibaskoLogo'

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-cyan-950/70 bg-black/90">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 md:grid-cols-[1.2fr_0.8fr_0.8fr]">
        <div className="space-y-4">
          <ChibaskoLogo compact />
          <p className="max-w-md text-sm leading-6 text-zinc-400">
            ChibaskoGames rassemble des jeux 100% gratuits accessibles directement depuis votre navigateur, avec une navigation simplifiée, des favoris et un profil joueur pour une expérience plus immersive !
          </p>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-black uppercase tracking-[0.3em] text-cyan-300">Explorer</h2>
          <div className="space-y-3 text-sm text-zinc-400">
            <Link href="/" className="block hover:text-white">Accueil</Link>
            <Link href="/games" className="block hover:text-white">Catalogue</Link>
            <Link href="/favorites" className="block hover:text-white">Favoris</Link>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-sm font-black uppercase tracking-[0.3em] text-cyan-300">Infos</h2>
          <div className="space-y-3 text-sm text-zinc-400">
            <Link href="/a-propos" className="block hover:text-white">A propos</Link>
            <Link href="/faq" className="block hover:text-white">FAQ</Link>
            <Link href="/contact" className="block hover:text-white">Contact</Link>
            <Link href="/mentions-legales" className="block hover:text-white">Mentions legales</Link>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-900/80 px-4 py-4 text-center text-[11px] uppercase tracking-[0.3em] text-zinc-600">
        © {new Date().getFullYear()} ChibaskoGames
      </div>
    </footer>
  )
}

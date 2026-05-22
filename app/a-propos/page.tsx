import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'A propos',
  description:
    'Decouvre l histoire de Chibasko Games, la vision de l equipe Chibasko et l ambition de devenir aussi un hub de creation de jeux.',
  path: '/a-propos',
})

export default function AProposPage() {
  return (
    <div className="mx-auto max-w-5xl rounded-[32px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Equipe Chibasko</p>
      <h1 className="mt-3 text-4xl font-black uppercase text-white">A propos de nous</h1>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-400">
        Chibasko Games est ne d une envie simple : construire un univers de jeux en ligne accessible, vivant et de plus en plus creatif au fil du temps.
      </p>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">Le point de depart</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Je suis un etudiant en informatique a Paris-Saclay qui aime le developpement, si bien que j ai voulu en faire l experience moi meme. C est en ayant voulu tester mes competences et les mettre a profit du monde que j ai eu l inspiration de faire Chibasko Games.
          </p>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">L esprit Chibasko</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Chibasko Games, c est avant tout un univers de jeux, pense pour jouer facilement, decouvrir des experiences differentes et construire une vraie identite autour de la plateforme.
          </p>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6 lg:col-span-2">
          <h2 className="text-lg font-black uppercase text-white">Ce que le projet devient</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Chibasko Games est et sera bientot aussi un hub de creation de jeux. Certains projets sont deja en cours de developpement, avec l idee de proposer a terme non seulement une plateforme pour jouer, mais aussi un espace ou de nouvelles creations pourront voir le jour et grandir.
          </p>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">Mes liens</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Si tu veux suivre l evolution de Chibasko Games, voir mon code ou soutenir directement mon travail personnel, tu peux passer par ces liens.
          </p>
          <div className="mt-5 grid gap-3">
            <Link
              href="https://github.com/Chibasko06"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-100"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path d="M12 2C6.477 2 2 6.596 2 12.267c0 4.537 2.865 8.387 6.839 9.746.5.095.682-.223.682-.495 0-.244-.009-.89-.014-1.748-2.782.62-3.369-1.384-3.369-1.384-.455-1.187-1.11-1.503-1.11-1.503-.908-.637.069-.624.069-.624 1.004.072 1.532 1.058 1.532 1.058.892 1.565 2.341 1.113 2.91.851.091-.667.35-1.113.636-1.369-2.22-.261-4.555-1.14-4.555-5.073 0-1.12.389-2.036 1.029-2.754-.103-.261-.446-1.312.098-2.736 0 0 .84-.277 2.75 1.052A9.36 9.36 0 0 1 12 6.844a9.36 9.36 0 0 1 2.504.347c1.909-1.329 2.748-1.052 2.748-1.052.546 1.424.203 2.475.1 2.736.64.718 1.028 1.634 1.028 2.754 0 3.943-2.338 4.809-4.566 5.065.359.319.678.947.678 1.909 0 1.379-.012 2.49-.012 2.829 0 .274.18.594.688.493C19.138 20.65 22 16.802 22 12.267 22 6.596 17.523 2 12 2Z" />
              </svg>
              <span>Voir mon GitHub</span>
            </Link>
            <Link
              href="https://paypal.me/chibasko06"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-100"
            >
              <Image src="/brands/paypal-logo.svg" alt="PayPal" width={24} height={24} className="h-6 w-6" />
              <span>Soutenir via PayPal</span>
            </Link>
          </div>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">Ummanitary</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            En dehors de Chibasko Games, je suis aussi membre du bureau d Ummanitary. C est une association porte par des benevoles engages, avec des actions solidaires locales et internationales. Si tu veux nous soutenir ou simplement decouvrir ce que l on fait, voici les liens utiles.
          </p>
          <div className="mt-5 grid gap-3">
            <Link
              href="https://www.helloasso.com/associations/ummanitary"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-100"
            >
              <Image src="/brands/helloasso-logo.svg" alt="HelloAsso" width={24} height={24} className="h-6 w-6" />
              <span>Voir HelloAsso</span>
            </Link>
            <Link
              href="https://ummanitary.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-3 rounded-full bg-[#DDF3EB] px-5 py-3 text-sm font-bold text-[#0B6D57] transition hover:bg-[#CFEBDD]"
            >
              <Image src="/brands/ummanitary-logo.svg" alt="Ummanitary" width={96} height={48} className="h-8 w-auto" />
              <span>Aller sur notre site</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

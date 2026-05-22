import type { Metadata } from 'next'
import Link from 'next/link'
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
              <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                <path fill="#003087" d="M8.6 3.4h5.1c1.8 0 3.2.4 4 1.3.6.6.9 1.5.7 2.6-.3 2.7-2.3 4.1-5.8 4.1H11c-.2 0-.4.1-.4.3l-.7 4.6c0 .1-.1.2-.2.2H6.3c-.2 0-.3-.2-.3-.4L8.2 3.7c0-.2.2-.3.4-.3Z" />
                <path fill="#009CDE" d="M10.8 18.7H7.9c-.2 0-.4-.2-.3-.4l1.5-9.7c0-.2.2-.3.4-.3h2.2c2.6 0 4.5.6 5.1 2.2.3.7.3 1.5.1 2.6-.4 3.3-2.6 5.6-6.1 5.6Z" />
              </svg>
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
              <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                <defs>
                  <linearGradient id="helloassoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#F7A600" />
                    <stop offset="45%" stopColor="#6CC18A" />
                    <stop offset="100%" stopColor="#C13FA3" />
                  </linearGradient>
                </defs>
                <path
                  fill="url(#helloassoGradient)"
                  d="M12 2.8c4.8 0 8.6 3.8 8.6 8.5 0 4.6-3.5 8.1-8.5 9.9-4.9-1.8-8.7-5.2-8.7-9.9 0-4.7 3.8-8.5 8.6-8.5Zm0 3.1c-3 0-5.4 2.4-5.4 5.4 0 2.6 1.8 4.8 5.4 6.4 3.5-1.6 5.3-3.8 5.3-6.4 0-3-2.4-5.4-5.3-5.4Z"
                />
              </svg>
              <span>Voir HelloAsso</span>
            </Link>
            <Link
              href="https://ummanitary.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-3 rounded-full bg-white px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-zinc-100"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                <path
                  fill="#0B6E5A"
                  d="M12 2.5c2.6 3.8 5.9 5.8 5.9 9.8 0 3.3-2.5 6.5-5.9 9.2-3.4-2.7-5.9-5.9-5.9-9.2 0-4 3.3-6 5.9-9.8Z"
                />
                <path
                  fill="#D3B17A"
                  d="M12 8.1c1.5 2 3.4 3.2 3.4 5.2 0 1.7-1.4 3.4-3.4 4.9-2-1.5-3.4-3.2-3.4-4.9 0-2 1.9-3.2 3.4-5.2Z"
                />
                <path
                  fill="#ffffff"
                  d="M12 6.7c-1.7 2.1-4.1 3.8-4.1 6.7 0 2.1 1.3 4 4.1 6.2 2.7-2.2 4.1-4.1 4.1-6.2 0-2.9-2.4-4.6-4.1-6.7Zm0 2.3c1.3 1.5 2.3 2.6 2.3 4.1 0 1.2-.8 2.4-2.3 3.7-1.5-1.3-2.3-2.5-2.3-3.7 0-1.5 1-2.6 2.3-4.1Z"
                />
              </svg>
              <span>Aller sur notre site</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

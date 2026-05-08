import type { Metadata } from 'next'
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
      </div>
    </div>
  )
}

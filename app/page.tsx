import Link from 'next/link'
import { GameCard } from '@/components/GameCard'
import { getFeaturedGames, getGamesByCategory, getHomepageHighlights } from '@/lib/queries/games'

export default async function Home() {
  const [featuredGames, categorySections, homepageHighlights] = await Promise.all([
    getFeaturedGames(8),
    getGamesByCategory(4),
    getHomepageHighlights(),
  ])

  return (
    <div className="space-y-14">
      <section className="overflow-hidden rounded-[28px] border border-cyan-950/80 bg-[linear-gradient(135deg,rgba(8,12,18,0.98),rgba(15,23,42,0.92))]">
        <div className="grid gap-8 px-6 py-8 md:px-10 md:py-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="space-y-6">
            <p className="text-[11px] uppercase tracking-[0.45em] text-cyan-300/75">
              Chibasko Games Version 2.0
            </p>
            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-black uppercase leading-none text-white md:text-6xl">
                Votre navigateur devient
                <span className="block text-cyan-400"> votre console</span>
              </h1>
              <p className="max-w-xl text-base leading-7 text-zinc-300">
                Accédez à des centaines de jeux gratuits sans aucune installation. Créez votre profil, gagnez de l'XP et grimpez dans le classement.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/games"
                className="rounded-full bg-cyan-400 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-black transition hover:bg-cyan-300"
              >
                Explorer les jeux
              </Link>
              <Link
                href="/register"
                className="rounded-full border border-cyan-700/70 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-cyan-200 transition hover:bg-zinc-900"
              >
                Creer un compte
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
                <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Sans attente</p>
                <p className="mt-2 text-sm text-zinc-300">Cliquez, jouez. Aucun téléchargement ni installation requis.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
                <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">100% gratuit</p>
                <p className="mt-2 text-sm text-zinc-300">Tous nos jeux sont accessibles librement, sans frais cachés.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-black/35 p-4">
                <p className="text-[10px] uppercase tracking-[0.35em] text-zinc-500">Compte joueur</p>
                <p className="mt-2 text-sm text-zinc-300">Sauvegardez vos scores, vos favoris et votre XP sur votre compte.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {homepageHighlights.map((highlight, index) => (
              <Link
                key={`${highlight.label}-${highlight.game.id}`}
                href={`/games/${highlight.game.slug}`}
                className={`group overflow-hidden rounded-[24px] border border-zinc-800 bg-black/40 ${
                  index === 0 ? 'sm:col-span-2' : ''
                }`}
              >
                {highlight.game.thumbnail_url ? (
                  <img
                    src={highlight.game.thumbnail_url}
                    alt={highlight.game.title}
                    className={`w-full object-cover transition duration-300 group-hover:scale-105 ${
                      index === 0 ? 'h-56' : 'h-40'
                    }`}
                  />
                ) : (
                  <div className={`flex w-full items-center justify-center bg-zinc-900 text-4xl ${
                    index === 0 ? 'h-56' : 'h-40'
                  }`}>
                    C
                  </div>
                )}
                <div className="space-y-2 p-4">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300/80">{highlight.label}</p>
                  <h2 className="text-lg font-black text-white">{highlight.game.title}</h2>
                  <p className="text-sm text-zinc-400">{highlight.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em] text-zinc-500">Selection chaude</p>
            <h2 className="text-3xl font-black uppercase text-white">Jeux populaires</h2>
          </div>
          <Link href="/games" className="text-sm font-semibold text-cyan-300 hover:text-cyan-200">
            Voir tout le catalogue
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {featuredGames.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      {categorySections.map((section) => (
        <section key={section.category.id} className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-zinc-500">Categorie</p>
              <h2 className="text-3xl font-black uppercase text-white">{section.category.name}</h2>
            </div>
            <Link
              href={`/games?category=${section.category.slug}`}
              className="text-sm font-semibold text-cyan-300 hover:text-cyan-200"
            >
              Ouvrir la categorie
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {section.games.map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

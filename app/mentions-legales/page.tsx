export default function MentionsLegalesPage() {
  return (
    <div className="mx-auto max-w-4xl rounded-[28px] border border-cyan-950/80 bg-zinc-950 p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Informations legales</p>
      <h1 className="mt-3 text-4xl font-black uppercase text-white">Mentions legales</h1>

      <div className="mt-8 space-y-8 text-sm leading-7 text-zinc-400">
        <section>
          <h2 className="text-lg font-black uppercase text-white">Editeur</h2>
          <p className="mt-2">
            ChibaskoGames est un projet web de diffusion de jeux navigateur. Remplace ici les
            informations d&apos;identite de l&apos;editeur, l&apos;adresse postale et le contact officiel.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black uppercase text-white">Hebergement</h2>
          <p className="mt-2">
            Application Next.js et services associes deployes avec ton hebergeur cible.
            Base de donnees et authentification gerees par Supabase.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black uppercase text-white">Donnees personnelles</h2>
          <p className="mt-2">
            Les donnees necessaires au fonctionnement du compte joueur peuvent inclure l&apos;email,
            le pseudo, l&apos;avatar, les favoris et l&apos;historique de jeu.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-black uppercase text-white">Propriete intellectuelle</h2>
          <p className="mt-2">
            Les contenus, marques, visuels et jeux restent soumis aux droits de leurs auteurs et
            ayants droit respectifs.
          </p>
        </section>
      </div>
    </div>
  )
}

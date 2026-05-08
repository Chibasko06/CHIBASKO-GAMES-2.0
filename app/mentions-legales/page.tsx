import type { Metadata } from 'next'
import { buildPageMetadata } from '@/lib/seo'

export const metadata: Metadata = buildPageMetadata({
  title: 'Mentions legales',
  description:
    'Consulte les mentions legales de Chibasko Games concernant le site, les donnees personnelles, les cookies et la legislation applicable.',
  path: '/mentions-legales',
})

export default function MentionsLegalesPage() {
  return (
    <div className="mx-auto max-w-5xl rounded-[32px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Cadre juridique</p>
      <h1 className="mt-3 text-4xl font-black uppercase text-white">Mentions legales</h1>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-400">
        Voici les informations legales essentielles relatives a l utilisation du site Chibasko Games.
      </p>

      <div className="mt-10 space-y-5">
        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">1. Objet du site</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Chibasko Games est une plateforme proposant des jeux video crees par des developpeurs
            independants. Les utilisateurs peuvent jouer en ligne et acceder aux contenus publies
            par les createurs.
          </p>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">2. Propriete intellectuelle</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-400">
            <p>
              Tous les contenus presents sur ce site, notamment les textes, images, jeux, logos
              et videos, sont proteges par le droit de la propriete intellectuelle.
            </p>
            <p>
              Les jeux fournis par des tiers restent la propriete exclusive de leurs createurs.
            </p>
            <p>
              Toute reproduction, distribution ou modification sans autorisation prealable est interdite.
            </p>
          </div>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">3. Responsabilite</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-400">
            <p>
              Chibasko Games ne peut etre tenu responsable des contenus publies par les createurs.
            </p>
            <p>
              Les utilisateurs jouent aux jeux a leurs propres risques.
            </p>
            <p>
              Nous nous reservons le droit de retirer tout contenu juge inapproprie, illicite ou
              contraire au bon fonctionnement de la plateforme.
            </p>
          </div>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">4. Donnees personnelles</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-400">
            <p>
              Les informations collectees via le formulaire de contact, a savoir nom, prenom,
              email et message, sont utilisees uniquement pour repondre aux demandes des utilisateurs.
            </p>
            <p>
              Conformement a la loi Informatique et Libertes ainsi qu au RGPD, les utilisateurs
              disposent d un droit d acces, de modification et de suppression de leurs donnees.
            </p>
            <p>
              Pour exercer ce droit, contacte-nous a l adresse suivante :
              <span className="ml-2 font-bold text-cyan-300">chibasko06@gmail.com</span>
            </p>
          </div>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">5. Cookies</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-400">
            <p>
              Le site peut utiliser des cookies ou des mecanismes techniques similaires afin d ameliorer
              l experience utilisateur et le bon fonctionnement du service.
            </p>
            <p>
              Aucun cookie n est utilise a des fins commerciales sans consentement explicite de l utilisateur.
            </p>
          </div>
        </section>

        <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
          <h2 className="text-lg font-black uppercase text-white">6. Loi applicable</h2>
          <p className="mt-3 text-sm leading-7 text-zinc-400">
            Le site Chibasko Games et l ensemble de son contenu sont regis par la legislation francaise.
            Tout litige relatif a l utilisation du site releve de la competence des tribunaux francais.
          </p>
        </section>
      </div>
    </div>
  )
}

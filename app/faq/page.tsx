import FaqAnswer from '@/components/FaqAnswer'
import type { Metadata } from 'next'
import { getPublishedFaqEntries } from '@/lib/queries/faq'
import { buildPageMetadata } from '@/lib/seo'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'Aide et questions fréquentes',
  description:
    'Retrouve les reponses aux questions frequentes sur Chibasko Games : compte joueur, jeux en ligne, profils, favoris et fonctionnement de la plateforme.',
  path: '/faq',
})

export default async function FaqPage() {
  const faqEntries = await getPublishedFaqEntries()

  return (
    <div className="mx-auto max-w-5xl rounded-[32px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Aide rapide</p>
      <h1 className="mt-3 text-4xl font-black uppercase text-white">FAQ</h1>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-400">
        Retrouve ici les reponses aux questions les plus frequentes autour de Chibasko Games, du compte joueur, des jeux et de la plateforme.
      </p>

      <div className="mt-10 space-y-4">
        <section className="rounded-[24px] border border-cyan-900 bg-black/30 p-6" aria-labelledby="developer-faq-title"><h2 id="developer-faq-title" className="text-lg font-bold text-white">Publier et suivre mon jeu</h2><p className="mt-3 text-sm leading-7 text-zinc-300">Vous pouvez soumettre un ZIP HTML5 classique, un ZIP utilisant le SDK ou une URL HTTPS externe classique. Créez votre fiche dans l’Espace développeur et vérifiez votre adresse professionnelle avant un dépôt ou une correction. Chaque version reste soumise à une revue humaine.</p><p className="mt-3 text-sm leading-7 text-zinc-300">Les décisions, motifs de correction et versions se consultent dans « Mes soumissions ». L’envoi d’un e-mail n’est pas une preuve de publication ; le statut du dossier reste disponible même si une notification échoue.</p><div className="mt-3 flex flex-wrap gap-4 text-sm text-cyan-300"><Link href="/developer">Espace développeur</Link><Link href="/developer/profile">Mon profil développeur</Link><Link href="/developpeurs">Préparer une soumission</Link></div></section>
        {faqEntries.length === 0 ? (
          <section className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
            <h2 className="text-lg font-black uppercase text-white">FAQ en preparation</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              La foire aux questions sera remplie au fur et a mesure. Tu peux deja nous contacter si tu as besoin d aide.
            </p>
          </section>
        ) : (
          faqEntries.map((entry) => (
            <section key={entry.id} className="rounded-[24px] border border-zinc-800 bg-black/30 p-6">
              <h2 className="text-lg font-black uppercase text-white">{entry.question}</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-400 whitespace-pre-line"><FaqAnswer text={entry.answer}/></p>
            </section>
          ))
        )}
      </div>
      <nav aria-label="Liens utiles" className="mt-8 flex flex-wrap gap-4 text-sm text-cyan-300">
        <Link href="/games">Trouver un jeu</Link><Link href="/developpeurs">Guide développeur</Link><Link href="/contact">Nous contacter</Link>
      </nav>
    </div>
  )
}

import type { Metadata } from 'next'
import { getPublishedFaqEntries } from '@/lib/queries/faq'
import { buildPageMetadata } from '@/lib/seo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = buildPageMetadata({
  title: 'FAQ',
  description:
    'Retrouve les reponses aux questions frequentes sur Chibasko Games, les comptes joueurs, les jeux et la plateforme.',
  path: '/faq',
})

export default async function FaqPage() {
  const faqEntries = await getPublishedFaqEntries()
  const structuredData = faqEntries.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faqEntries.map((entry) => ({
          '@type': 'Question',
          name: entry.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: entry.answer,
          },
        })),
      }
    : null

  return (
    <div className="mx-auto max-w-5xl rounded-[32px] border border-cyan-950/80 bg-[linear-gradient(180deg,rgba(10,15,23,0.98),rgba(9,9,11,0.98))] p-8 md:p-10">
      {structuredData ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      ) : null}
      <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Aide rapide</p>
      <h1 className="mt-3 text-4xl font-black uppercase text-white">FAQ</h1>
      <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-400">
        Retrouve ici les reponses aux questions les plus frequentes autour de Chibasko Games, du compte joueur, des jeux et de la plateforme.
      </p>

      <div className="mt-10 space-y-4">
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
              <p className="mt-3 text-sm leading-7 text-zinc-400 whitespace-pre-line">{entry.answer}</p>
            </section>
          ))
        )}
      </div>
    </div>
  )
}

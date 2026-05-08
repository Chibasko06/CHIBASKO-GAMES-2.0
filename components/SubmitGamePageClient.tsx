"use client";

import { FormEvent, useMemo, useState } from 'react'

type CategoryOption = {
  id: string
  name: string
  slug: string
}

type SubmitGameFormState = {
  name_or_studio: string
  email: string
  game_title: string
  demo_url: string
  game_type: string
  category_names: string[]
  description: string
  has_ads: 'unknown' | 'yes' | 'no'
  published_elsewhere: string
  expectations: string
  message: string
}

const emptyForm: SubmitGameFormState = {
  name_or_studio: '',
  email: '',
  game_title: '',
  demo_url: '',
  game_type: '',
  category_names: [],
  description: '',
  has_ads: 'unknown',
  published_elsewhere: '',
  expectations: '',
  message: '',
}

export default function SubmitGamePageClient({
  categories,
}: {
  categories: CategoryOption[]
}) {
  const [form, setForm] = useState<SubmitGameFormState>(emptyForm)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const selectedCount = useMemo(() => form.category_names.length, [form.category_names.length])

  const handleCategoryToggle = (name: string) => {
    setForm((current) => ({
      ...current,
      category_names: current.category_names.includes(name)
        ? current.category_names.filter((entry) => entry !== name)
        : [...current.category_names, name],
    }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)

    if (!form.name_or_studio || !form.email || !form.game_title || !form.demo_url || !form.game_type || !form.description) {
      setFeedback('Remplis tous les champs obligatoires avant d envoyer ta proposition.')
      return
    }

    setSending(true)

    try {
      const response = await fetch('/api/game-submissions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || 'Impossible d envoyer la proposition.')
      }

      setForm(emptyForm)
      setFeedback('Ta proposition a bien ete envoyee. Elle sera etudiee manuellement par Chibasko Games.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Impossible d envoyer la proposition.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[30px] border border-cyan-950/80 bg-[linear-gradient(135deg,rgba(6,10,16,0.98),rgba(15,23,42,0.94))] p-8 md:p-10">
        <p className="text-[11px] uppercase tracking-[0.45em] text-cyan-300/80">Espace developpeur</p>
        <h1 className="mt-4 text-4xl font-black uppercase text-white md:text-5xl">Publier un jeu</h1>
        <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-300">
          Tu developpes un jeu HTML5, WebGL ou jouable directement dans le navigateur ? Tu peux proposer ton projet a Chibasko Games. Nous etudions les jeux compatibles avec notre facon de publier et d integrer le catalogue.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[22px] border border-zinc-800 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Ce que nous regardons</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Lien de demo jouable, integration navigateur, categories, compatibilite et presentation claire du projet.</p>
          </div>
          <div className="rounded-[22px] border border-zinc-800 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Ce que nous ne promettons pas</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Pas de revenus automatiques garantis. Chaque proposition est evaluee au cas par cas.</p>
          </div>
          <div className="rounded-[22px] border border-zinc-800 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Ce qui est possible</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Visibilite sur le site, mise en avant editoriale et collaborations si le jeu colle bien a l univers Chibasko.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">Proposition manuelle</p>
          <h2 className="mt-3 text-2xl font-black uppercase text-white">Envoyer un projet</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
            Remplis ce formulaire avec les infos utiles. L idee est de recuperer un format proche de la fiche jeu utilisee dans l admin, pour que l etude et l integration soient plus simples si ton projet est retenu.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input
            value={form.name_or_studio}
            onChange={(event) => setForm((current) => ({ ...current, name_or_studio: event.target.value }))}
            placeholder="Nom / studio"
            className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            required
          />
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="Email"
            className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            required
          />
          <input
            value={form.game_title}
            onChange={(event) => setForm((current) => ({ ...current, game_title: event.target.value }))}
            placeholder="Nom du jeu"
            className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            required
          />
          <input
            value={form.demo_url}
            onChange={(event) => setForm((current) => ({ ...current, demo_url: event.target.value }))}
            placeholder="Lien de demo"
            className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            required
          />
          <input
            value={form.game_type}
            onChange={(event) => setForm((current) => ({ ...current, game_type: event.target.value }))}
            placeholder="Type de jeu"
            className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500 md:col-span-2"
            required
          />

          <div className="rounded-[24px] border border-zinc-800 bg-black/35 p-4 md:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Categories souhaitees</p>
              <span className="text-[10px] uppercase tracking-[0.25em] text-cyan-300">{selectedCount} selection</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <label key={category.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800 px-3 py-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={form.category_names.includes(category.name)}
                    onChange={() => handleCategoryToggle(category.name)}
                  />
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
          </div>

          <textarea
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Description du jeu"
            className="min-h-40 rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500 md:col-span-2"
            required
          />

          <select
            value={form.has_ads}
            onChange={(event) => setForm((current) => ({ ...current, has_ads: event.target.value as SubmitGameFormState['has_ads'] }))}
            className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
          >
            <option value="unknown">Presence de pubs : non renseignee</option>
            <option value="yes">Oui, le jeu contient des pubs</option>
            <option value="no">Non, pas de pubs</option>
          </select>

          <input
            value={form.published_elsewhere}
            onChange={(event) => setForm((current) => ({ ...current, published_elsewhere: event.target.value }))}
            placeholder="Publication ailleurs ?"
            className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
          />

          <textarea
            value={form.expectations}
            onChange={(event) => setForm((current) => ({ ...current, expectations: event.target.value }))}
            placeholder="Attentes / conditions"
            className="min-h-32 rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500 md:col-span-2"
          />
          <textarea
            value={form.message}
            onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
            placeholder="Message complementaire"
            className="min-h-32 rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500 md:col-span-2"
          />

          {feedback ? (
            <p className="text-sm text-cyan-300 md:col-span-2">{feedback}</p>
          ) : null}

          <button
            type="submit"
            disabled={sending}
            className="rounded-full bg-cyan-400 px-6 py-4 font-black uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60 md:col-span-2"
          >
            {sending ? 'Envoi en cours...' : 'Envoyer la proposition'}
          </button>
        </form>
      </section>
    </div>
  )
}

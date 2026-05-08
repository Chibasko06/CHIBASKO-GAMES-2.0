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
  developer_website: string
  game_title: string
  demo_url: string
  game_type: string
  category_names: string[]
  short_description: string
  long_description: string
  mobile_compatibility: string
  sensitive_content: string
  has_ads: 'unknown' | 'yes' | 'no'
  published_elsewhere: string
  expectations: string
  message: string
  ownership_confirmed: boolean
}

const emptyForm: SubmitGameFormState = {
  name_or_studio: '',
  email: '',
  developer_website: '',
  game_title: '',
  demo_url: 'https://',
  game_type: '',
  category_names: [],
  short_description: '',
  long_description: '',
  mobile_compatibility: '',
  sensitive_content: '',
  has_ads: 'unknown',
  published_elsewhere: '',
  expectations: '',
  message: '',
  ownership_confirmed: false,
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

    if (
      !form.name_or_studio ||
      !form.email ||
      !form.game_title ||
      !form.demo_url ||
      !form.game_type ||
      !form.short_description ||
      !form.long_description ||
      !form.mobile_compatibility ||
      !form.sensitive_content
    ) {
      setFeedback('Remplis tous les champs obligatoires avant d envoyer ta proposition.')
      return
    }

    if (!form.demo_url.startsWith('https://')) {
      setFeedback('Le lien de demo doit commencer par https://.')
      return
    }

    if (form.developer_website && !form.developer_website.startsWith('https://')) {
      setFeedback('Le site ou portfolio doit commencer par https://.')
      return
    }

    if (!form.ownership_confirmed) {
      setFeedback('Tu dois confirmer que tu es proprietaire du jeu ou autorise a le proposer.')
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
      setFeedback('Ta proposition a bien ete envoyee. Elle passera dans le workflow de validation Chibasko Games.')
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
          Tu developpes un jeu HTML5, WebGL ou jouable directement dans le navigateur ? Tu peux proposer ton projet a Chibasko Games pour etude. Nous ne traitons pas les executables .exe : seuls les jeux navigateur, embed HTML5, WebGL ou iframe sont acceptes.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[22px] border border-zinc-800 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Format attendu</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Lien de demo https://, jeu directement jouable en navigateur, et presentation suffisamment claire pour evaluer l integration.</p>
          </div>
          <div className="rounded-[22px] border border-zinc-800 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Ce que nous ne promettons pas</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Pas de revenus automatiques ni de publication garantie. Chaque proposition est etudiee manuellement.</p>
          </div>
          <div className="rounded-[22px] border border-zinc-800 bg-black/30 p-4">
            <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">Ce qui peut suivre</p>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Visibilite sur le site, mise en avant editoriale et collaborations ponctuelles si le jeu colle bien a l univers Chibasko.</p>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-zinc-800 bg-zinc-950 p-6 md:p-8">
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300">Proposition manuelle</p>
          <h2 className="mt-3 text-2xl font-black uppercase text-white">Envoyer un projet</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
            Le formulaire suit volontairement une logique proche de ta fiche jeu admin : identite du developpeur, lien de demo, categorie, compatibilite, contenu et contexte de publication. Ca aide a verifier rapidement si le projet peut etre repris proprement dans ton catalogue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Nom ou studio</span>
            <input
              value={form.name_or_studio}
              onChange={(event) => setForm((current) => ({ ...current, name_or_studio: event.target.value }))}
              placeholder="Nom du createur ou du studio"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Email</span>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder="contact@studio.com"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Site ou portfolio</span>
            <input
              value={form.developer_website}
              onChange={(event) => setForm((current) => ({ ...current, developer_website: event.target.value }))}
              placeholder="https://ton-site.dev"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Nom du jeu</span>
            <input
              value={form.game_title}
              onChange={(event) => setForm((current) => ({ ...current, game_title: event.target.value }))}
              placeholder="Titre du projet"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Lien de demo HTTPS</span>
            <input
              value={form.demo_url}
              onChange={(event) => setForm((current) => ({ ...current, demo_url: event.target.value }))}
              placeholder="https://..."
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Type de jeu</span>
            <input
              value={form.game_type}
              onChange={(event) => setForm((current) => ({ ...current, game_type: event.target.value }))}
              placeholder="Arcade, puzzle, horror, idle, course..."
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            />
          </label>

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

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Description courte</span>
            <input
              value={form.short_description}
              onChange={(event) => setForm((current) => ({ ...current, short_description: event.target.value }))}
              placeholder="Resume rapide en une ou deux phrases"
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Description longue</span>
            <textarea
              value={form.long_description}
              onChange={(event) => setForm((current) => ({ ...current, long_description: event.target.value }))}
              placeholder="Boucle de jeu, objectifs, controles, progression, points forts..."
              className="min-h-40 w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Compatibilite mobile</span>
            <select
              value={form.mobile_compatibility}
              onChange={(event) => setForm((current) => ({ ...current, mobile_compatibility: event.target.value }))}
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            >
              <option value="">Choisir une option</option>
              <option value="mobile-compatible">Compatible mobile</option>
              <option value="pc-only">PC uniquement</option>
              <option value="partial">Partiellement compatible</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Contenu sensible</span>
            <select
              value={form.sensitive_content}
              onChange={(event) => setForm((current) => ({ ...current, sensitive_content: event.target.value }))}
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
              required
            >
              <option value="">Choisir une option</option>
              <option value="none">Aucun contenu sensible</option>
              <option value="violence-light">Violence legere</option>
              <option value="violence-strong">Violence marquee</option>
              <option value="adult-themes">Themes adultes</option>
              <option value="mixed-sensitive">Contenu sensible mixte</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Presence de pubs</span>
            <select
              value={form.has_ads}
              onChange={(event) => setForm((current) => ({ ...current, has_ads: event.target.value as SubmitGameFormState['has_ads'] }))}
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            >
              <option value="unknown">Non renseignee</option>
              <option value="yes">Oui, le jeu contient des pubs</option>
              <option value="no">Non, pas de pubs</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Publication ailleurs</span>
            <input
              value={form.published_elsewhere}
              onChange={(event) => setForm((current) => ({ ...current, published_elsewhere: event.target.value }))}
              placeholder="Steam, Itch.io, CrazyGames, perso..."
              className="w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Attentes / conditions</span>
            <textarea
              value={form.expectations}
              onChange={(event) => setForm((current) => ({ ...current, expectations: event.target.value }))}
              placeholder="Visibilite, exclusivite, credits, contraintes techniques, collaboration..."
              className="min-h-32 w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Message complementaire</span>
            <textarea
              value={form.message}
              onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
              placeholder="Infos supplementaires a transmettre a l equipe"
              className="min-h-32 w-full rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
            />
          </label>

          <label className="rounded-[24px] border border-zinc-800 bg-black/35 p-4 text-sm text-zinc-300 md:col-span-2">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.ownership_confirmed}
                onChange={(event) => setForm((current) => ({ ...current, ownership_confirmed: event.target.checked }))}
                className="mt-1"
                required
              />
              <span>
                Je confirme etre proprietaire du jeu ou avoir l autorisation de le proposer a Chibasko Games.
              </span>
            </div>
          </label>

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

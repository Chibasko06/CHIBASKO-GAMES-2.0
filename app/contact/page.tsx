"use client";

import { FormEvent, useState } from 'react'

type ContactFormState = {
  firstName: string
  lastName: string
  email: string
  message: string
}

const emptyForm: ContactFormState = {
  firstName: '',
  lastName: '',
  email: '',
  message: '',
}

export default function ContactPage() {
  const [form, setForm] = useState<ContactFormState>(emptyForm)
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.firstName || !form.lastName || !form.email || !form.message) {
      setFeedback('Remplis tous les champs avant d envoyer ton message.')
      return
    }

    const subject = encodeURIComponent(`Contact Chibasko Games - ${form.firstName} ${form.lastName}`)
    const body = encodeURIComponent(
      `Nom: ${form.lastName}\nPrenom: ${form.firstName}\nEmail: ${form.email}\n\nMessage:\n${form.message}`
    )

    window.location.href = `mailto:chibasko06@gmail.com?subject=${subject}&body=${body}`
    setFeedback('Ton logiciel mail va s ouvrir avec le message pre-rempli.')
  }

  return (
    <div className="mx-auto max-w-4xl rounded-[28px] border border-cyan-950/80 bg-zinc-950 p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Contact</p>
      <h1 className="mt-3 text-4xl font-black uppercase text-white">Nous contacter</h1>
      <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400">
        Une question, un bug, une idee de partenariat ou un retour sur un jeu ? Remplis ce
        formulaire et ton message sera prepare pour etre envoye a l adresse Chibasko Games.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <input
          value={form.lastName}
          onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))}
          placeholder="Nom"
          className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
          required
        />
        <input
          value={form.firstName}
          onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))}
          placeholder="Prenom"
          className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500"
          required
        />
        <input
          type="email"
          value={form.email}
          onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
          placeholder="Email"
          className="rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500 md:col-span-2"
          required
        />
        <textarea
          value={form.message}
          onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))}
          placeholder="Ton message"
          className="min-h-48 rounded-2xl border border-zinc-800 bg-black/60 p-4 text-white outline-none focus:border-cyan-500 md:col-span-2"
          required
        />
        {feedback ? (
          <p className="text-sm text-cyan-300 md:col-span-2">{feedback}</p>
        ) : null}
        <button
          type="submit"
          className="rounded-full bg-cyan-400 px-6 py-4 font-black uppercase tracking-[0.2em] text-black md:col-span-2"
        >
          Preparer l email
        </button>
      </form>

      <p className="mt-6 text-xs uppercase tracking-[0.25em] text-zinc-500">
        Adresse directe: chibasko06@gmail.com
      </p>
    </div>
  )
}

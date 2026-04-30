export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl rounded-[28px] border border-cyan-950/80 bg-zinc-950 p-8 md:p-10">
      <p className="text-[11px] uppercase tracking-[0.4em] text-cyan-300/80">Contact</p>
      <h1 className="mt-3 text-4xl font-black uppercase text-white">Nous contacter</h1>
      <div className="mt-6 space-y-5 text-sm leading-7 text-zinc-400">
        <p>
          Pour une demande de partenariat, un signalement de bug ou une question generale,
          tu peux nous contacter a l&apos;adresse suivante :
        </p>
        <p className="text-lg font-bold text-cyan-300">contact@chibaskogames.com</p>
        <p>
          Tu peux aussi utiliser cette page comme point d&apos;accroche avant d&apos;ajouter plus tard
          un vrai formulaire de contact relie a Supabase ou a un service mail.
        </p>
      </div>
    </div>
  )
}

export default function PreviewManualChecks({external=false}:{external?:boolean}={}) {
  return <details className="rounded-lg border border-zinc-700 p-4">
    <summary className="cursor-pointer font-semibold">Vérifications manuelles nécessaires</summary>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-300">
      <li>Démarrer une partie et vérifier les commandes.</li>
      <li>Écouter le son du jeu.</li>
      <li>Essayer la navigation et les pages internes.</li>
      <li>Vérifier les sauvegardes locales selon les réglages du navigateur.</li>
      <li>Essayer les exports ou téléchargements proposés par le jeu.</li>
    </ul>
    <p className="mt-2 text-sm text-zinc-400">{external
      ? 'Le sandbox externe utilise une origine opaque. Le stockage local et les téléchargements peuvent être bloqués.'
      : 'Une prévisualisation utilise une origine de session. Elle ne mesure pas la conservation des sauvegardes entre deux lancements publics.'}</p>
  </details>
}

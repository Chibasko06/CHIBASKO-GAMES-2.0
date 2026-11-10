import {parseValidationEvent,describeValidation} from '@/lib/game-distribution/validation-diagnostics'

export default function BuildValidationDiagnostic({history,attempts}:{history:{action:string;at:string}[];attempts:number}){
  const event=history.map(value=>parseValidationEvent(value.action)).filter(value=>value?.attempt===attempts).at(-1)
  if(!event)return <p className="text-sm text-zinc-400">Le motif précis n’a pas été enregistré pour cette tentative. Le code générique ne permet pas de conclure que l’archive est invalide.</p>
  const {diagnostic}=event
  const kind={submission:'Contrôle de la soumission',internal:'Erreur interne du validateur',infrastructure:'Incident temporaire d’infrastructure',unknown:'Cause non déterminée'}[diagnostic.kind]
  const description=describeValidation(diagnostic)
  return <section aria-label="Diagnostic technique" className="space-y-2 rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm">
    <h4 className="font-semibold text-zinc-100">{description.explanation}</h4>
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      {diagnostic.path&&<><dt className="text-zinc-400">Fichier</dt><dd className="min-w-0 break-all">{diagnostic.path}</dd></>}
      {diagnostic.field&&<><dt className="text-zinc-400">Champ</dt><dd className="min-w-0 break-all">{diagnostic.field}</dd></>}
    </dl>
    <p><span className="font-medium">Correction attendue : </span>{description.action}</p>
    <details><summary className="cursor-pointer text-cyan-300">Détails techniques</summary><p>{kind} · Phase : {description.phase} · Tentative {attempts}</p><code className="break-all">{diagnostic.reason}</code></details>
  </section>
}

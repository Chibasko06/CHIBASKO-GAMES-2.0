'use client'
import {useState} from 'react'
import {FormFeedback} from './ui/FormFeedback'

export default function GameIdentityNotice({gameId,newGame}:{gameId:string;newGame:boolean}){
  const [copied,setCopied]=useState(false),[copyFailed,setCopyFailed]=useState(false)
  async function copy(){
    try{await navigator.clipboard.writeText(gameId);setCopied(true);setCopyFailed(false)}
    catch{setCopied(false);setCopyFailed(true)}
  }
  return <div className="space-y-3"><FormFeedback tone={newGame?'success':'info'} title={newGame?'Identité privée du jeu créée':'Identité du jeu sélectionné'}>
    <p>gameId privé du jeu :</p>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <code aria-label="gameId" className="min-w-0 flex-1 select-all break-all rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-sm text-white">{gameId}</code>
      <button type="button" onClick={copy} aria-label="Copier le gameId" className="shrink-0 rounded-lg border border-current/40 px-4 py-2 font-medium hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400">Copier</button>
    </div>
    {copied&&<p role="status">gameId copié dans le presse-papiers.</p>}
    <p>Utilisez ce gameId dans <code>chibasko.json</code> pour construire le ZIP.</p>
    <p className="font-medium">{newGame?'Le jeu n’est pas encore publié.':'Aucune nouvelle version n’est publiée par cette sélection.'}</p>
  </FormFeedback>
  {copyFailed&&<FormFeedback tone="error" title="Copie indisponible"><p>Sélectionnez le gameId ci-dessus et copiez-le manuellement.</p></FormFeedback>}
  </div>
}

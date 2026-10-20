export type SubmissionMode='new'|'update'
export type ManagedGame={id:string;title:string}
export function SubmissionTabs({mode,onChange,disabled}:{mode:SubmissionMode;onChange:(mode:SubmissionMode)=>void;disabled:boolean}){
  return <div role="tablist" aria-label="Type de soumission" className="flex flex-wrap gap-3">
    {(['new','update'] as const).map((value,index)=><button key={value} type="button" role="tab" id={'tab-'+value}
      aria-selected={mode===value} aria-controls="submission-panel" tabIndex={mode===value?0:-1} disabled={disabled}
      className={'rounded border px-4 py-3 '+(mode===value?'border-cyan-500 bg-cyan-950':'border-zinc-700')}
      onClick={()=>onChange(value)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();const next=event.key==='Home'?'new':event.key==='End'?'update':index===0?'update':'new'
        onChange(next);document.getElementById('tab-'+next)?.focus()
      }}}>{value==='new'?'Publier un nouveau jeu':'Mettre à jour un jeu existant'}</button>)}
  </div>
}
export function ManagedGamePicker({games,value,loading,onChange}:{games:ManagedGame[];value:string;loading:boolean;onChange:(id:string)=>void}){
  if(loading)return <FormFeedback tone="info" title="Chargement des jeux gérés…" announce/>
  if(!games.length&&!value)return <FormFeedback tone="info" title="Aucun jeu à mettre à jour"><p>Vous ne gérez aucun jeu pour le moment. Utilisez l’onglet « Publier un nouveau jeu » pour votre première soumission.</p></FormFeedback>
  return <div><label htmlFor="managed-game">Jeu géré</label><select id="managed-game" aria-describedby="managed-game-help" className="block w-full rounded border border-zinc-700 bg-zinc-950 p-3" value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">Sélectionner un jeu</option>
    {value&&!games.some(g=>g.id===value)&&<option value={value}>Jeu de l’envoi en cours</option>}
    {games.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}
  </select><HelpText id="managed-game-help">Seuls les jeux dont votre compte est membre apparaissent ici.</HelpText></div>
}
import {FormFeedback,HelpText} from './ui/FormFeedback'


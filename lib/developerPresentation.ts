import {reviewLabel,type ReviewSummary} from './game-distribution/review'

export type Tone='neutral'|'success'|'warning'|'danger'|'info'
export type Project={id:string;title:string;isPublished:boolean;activeVersionId:string|null;externalRevisionId:string|null;recordedViews:number;favorites:number;reviews:number;buildCount:number;revisionCount:number;draftState:string|null;correctionRequired:boolean}
export type DecisionEvent={action:string;reason:string|null;at:string}
export type Build=ReviewSummary&{id:string;version:string;versionId:string|null;createdAt:string;submissionId:string|null;history:DecisionEvent[]}
export type Revision={id:string;url:string;createdAt:string;status:string;action:string|null;history:DecisionEvent[]}
export type WorkspaceData={games:Project[];builds?:Build[];external?:Revision[]}
export type Activity={id:string;gameId:string;title:string;createdAt:string;version?:string;hosting:'zip'|'external';label:string;tone:Tone}
const date=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Paris'})
const time=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'})
export function developerDate(value:string|null|undefined,withTime=false){return value&&Number.isFinite(Date.parse(value))?(withTime?time:date).format(new Date(value)):'Date non renseignée'}
export function developerNumber(value:unknown){return typeof value==='number'&&Number.isFinite(value)&&value>=0?value.toLocaleString('fr-FR'):'—'}
export function buildStatus(value:ReviewSummary):{label:string;tone:Tone}{
 const label=value.decision==='published'?'Version acceptée':reviewLabel(value)
 return {label,tone:label==='Correction demandée'?'warning':/échouée|Refusé|expirée/.test(label)?'danger':/acceptée|réussie/.test(label)?'success':/cours|attente/.test(label)?'info':'neutral'}
}
export function projectStatus(game:Project):{label:string;tone:Tone}{return game.correctionRequired?{label:'Correction demandée',tone:'warning'}:game.isPublished?{label:'Jeu publié',tone:'success'}:game.activeVersionId||game.externalRevisionId?{label:'Version acceptée · hors ligne',tone:'info'}:game.draftState&&game.draftState!=='submitted'||game.buildCount===0&&game.revisionCount===0?{label:'Brouillon',tone:'neutral'}:{label:'En cours de revue',tone:'info'}}
export const decisionLabels:Record<string,string>={review:'Revue effectuée',publish:'Version acceptée',reject:'Refus',archive:'Archivage',correction_requested:'Correction demandée',corrected_build_prepared:'Build corrigé préparé',approve:'Révision acceptée',correction:'Correction demandée',suspend:'Suspension',withdraw:'Retrait'}
export function externalStatus(action:string|null,status:string):{label:string;tone:Tone}{
 const label=action==='publish'?'Révision publiée':decisionLabels[action??'']??({pending:'En attente de revue',reviewing:'Revue en cours',accepted:'Révision acceptée',rejected:'Refusée',archived:'Archivée'}[status]??'État indéterminé')
 return {label,tone:action==='correction'?'warning':['reject','suspend','withdraw'].includes(action??'')||status==='rejected'?'danger':['approve','publish'].includes(action??'')?'success':'info'}
}
export function activityInPeriod(rows:Activity[],days:number,now=Date.now()){return rows.filter(r=>Number.isFinite(Date.parse(r.createdAt))&&Date.parse(r.createdAt)<=now&&(!days||Date.parse(r.createdAt)>=now-days*86400000))}
export function monthlyActivity(rows:Activity[]){const buckets=new Map<string,number>();for(const row of rows){const d=new Date(row.createdAt);if(!Number.isFinite(d.getTime()))continue;const key=new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',timeZone:'Europe/Paris'}).format(d);buckets.set(key,(buckets.get(key)??0)+1)}return [...buckets].sort(([a],[b])=>a.localeCompare(b)).map(([month,count])=>({month,label:date.format(new Date(month+'-15T12:00:00Z')).replace(/^15 /,''),count}))}

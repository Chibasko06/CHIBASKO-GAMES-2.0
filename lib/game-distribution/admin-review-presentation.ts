import {REVIEW_CHECKLIST,type AdminBuild} from './review'
export const ADMIN_REVIEW_LABELS={tested:'Jeu lancé et fonctionnel',content:'Contenu vérifié',metadata:'Informations et description correctes',behavior:'Aucun comportement suspect'} as const
export const checklistComplete=(checks:Record<string,boolean>)=>Object.keys(REVIEW_CHECKLIST).every(key=>checks[key]===true)
export function reviewPresentation(build:AdminBuild,checks=build.review.checklist){
 const archived=build.review.decision==='archived'||build.versionStatus==='archived'
 const rejected=build.review.decision==='rejected'||build.versionStatus==='rejected'
 const published=build.versionStatus==='published'
 const terminal=archived||rejected||published
 const complete=build.technicalStatus==='completed'
 const canTest=complete&&!!build.gameVersionId&&['draft','in_review','approved','published'].includes(build.versionStatus??'')&&!archived&&!rejected
 const canReview=complete&&!!build.gameVersionId&&['draft','in_review'].includes(build.versionStatus??'')&&!terminal
 const canPublish=canReview&&build.versionStatus==='in_review'&&build.review.decision==='reviewed'&&!!build.review.reviewedAt&&checklistComplete(build.review.checklist)&&checklistComplete(checks)
 const technical=complete?'Réussie':build.technicalStatus==='validating'?'En cours':['failed','expired'].includes(build.technicalStatus)?'Échec':'En attente'
 const label=archived?'Archivé':rejected?'Refusé':published?'Publié':canPublish?'Prêt à publier':!complete?'À vérifier':!canTest?'Vérification technique réussie':checks.tested?'Revue à compléter':'À tester'
 const tone:'muted'|'error'|'success'|'info'|'warning'=archived?'muted':rejected||technical==='Échec'?'error':published||canPublish?'success':complete?'info':'warning'
 const next=archived?'Cette version est archivée.':rejected?'Cette soumission a été refusée.':published?'Cette version est publiée.':technical==='Échec'?'Consulter le résultat technique avant de décider de la suite.':!complete?'Lancer la vérification technique, puis actualiser ce dossier.':canPublish?'Toutes les étapes sont enregistrées. La publication peut être confirmée.':!checks.tested?'Lancer le jeu de test avant de compléter la revue.':'Compléter puis enregistrer les quatre contrôles de revue.'
 return {label,tone,next,technical,canTest,canReview,canPublish,terminal,canReject:build.technicalStatus!=='validating'&&!['published','archived','approved'].includes(build.versionStatus??'')&&!rejected,canArchive:build.technicalStatus!=='validating'&&!archived}
}
export function reviewDate(value:string|null|undefined){if(!value)return 'Non renseignée';const date=new Date(value);return Number.isNaN(date.getTime())?'Non renseignée':date.toLocaleString('fr-FR',{timeZone:'Europe/Paris'})}

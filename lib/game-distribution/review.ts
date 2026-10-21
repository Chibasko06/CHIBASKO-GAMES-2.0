import type {DeveloperContact} from './developer-profile'
export type ReviewSummary={technicalStatus:string;versionStatus:string|null;decision:string;reason:string|null}
export const REVIEW_CHECKLIST={tested:'Jeu lancé et testé',content:'Contenu vérifié',metadata:'Informations et description vérifiées',behavior:'Aucun comportement suspect observé'} as const
export function reviewLabel(value:ReviewSummary) {
  if(value.decision==='archived'||value.versionStatus==='archived')return 'Archivé'
  if(value.decision==='rejected'||value.versionStatus==='rejected'||['failed','expired'].includes(value.technicalStatus))return 'Refusé'
  if(value.versionStatus==='published')return 'Publié'
  if(value.technicalStatus==='completed')return 'Vérification technique réussie'
  if(value.technicalStatus==='validating')return 'Vérification en cours'
  if(value.technicalStatus==='queued')return 'En attente de vérification'
  return 'Reçu'
}
export const REVIEW_NOTICE='La vérification manuelle peut prendre 24 à 48 h. Une validation technique réussie ne garantit pas la publication.'
export type AdminBuild={developerProfile?:DeveloperContact|null;id:string;gameId:string;game:string;developer:string;description:string|null;version:string;createdAt:string;updatedAt:string;archiveSize:number;
  technicalStatus:string;errorCode:string|null;attempts:number;gameVersionId:string|null;versionStatus:string|null;manifest:Record<string,unknown>|null;
  validatedAt:string|null;publishedAt:string|null;active:boolean|null;review:{decision:string;checklist:Record<string,boolean>;reviewedAt:string|null;reason:string|null;submissionId:string|null};
  submission:{id:string;title:string;developer:string;description:string;status:string;kind?:string|null;releaseDate?:string|null;technology?:string|null;mobile?:string;cover?:string|null;categories?:string[]}|null;history:{action:string;at:string}[]}
export function buildLabel(build:AdminBuild){return reviewLabel({...build,decision:build.review.decision,reason:build.review.reason})}
export function technicalError(code:string|null){return code?({validation_failed:'Archive ou manifeste invalide. Vérifier les chemins, entrypoints et quotas.',validation_timeout:'Délai de validation dépassé.',storage_error:'Stockage temporairement indisponible.',database_error:'Base temporairement indisponible.',version_conflict:'Cette version existe déjà. Envoyer une nouvelle version.',forbidden:'Autorisation de dépôt retirée.',upload_expired:'Upload expiré.',review_rejected:'Build refusé lors de la revue.'}[code]??'La validation n’a pas abouti.'):null}

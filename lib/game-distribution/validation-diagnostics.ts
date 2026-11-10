/** Données techniques bornées, sans message brut du parseur ni chemin serveur. */
export const VALIDATION_REASONS={
  ARCHIVE_SIZE_LIMIT:'Archive trop volumineuse',BUILD_FILE_LIMIT:'Nombre de fichiers hors limite',
  BUILD_FILE_SIZE:'Taille de fichier hors limite',BUILD_TOTAL_SIZE:'Taille décompressée hors limite',
  BUILD_PATH_DEPTH:'Chemin trop profond',BUILD_PATH_COLLISION:'Collision entre un fichier et un dossier',
  DUPLICATE_BUILD_PATH:'Chemin présent plusieurs fois',INVALID_DIRECTORY_ENTRY:'Entrée de dossier invalide',
  UNSUPPORTED_ARCHIVE_ENTRY:'Entrée ZIP non prise en charge',UNSAFE_ARTIFACT_PATH:'Chemin refusé',FORBIDDEN_ARTIFACT_FILE:'Type de fichier interdit',
  ARCHIVE_RATIO_LIMIT:'Taux de compression hors limite',ARCHIVE_EXPANSION_LIMIT:'Décompression au-delà des limites',
  ARCHIVE_SIZE_MISMATCH:'Taille décompressée différente de celle annoncée',ROOT_MANIFEST_REQUIRED:'Manifeste chibasko.json absent de la racine ou trop volumineux',
  INVALID_MANIFEST_JSON:'Manifeste JSON ou encodage UTF-8 invalide',INVALID_MANIFEST_SCHEMA:'Champ du manifeste invalide',
  UPLOAD_TARGET_MISMATCH:'Identifiant du jeu ou version différents du dépôt',INVALID_PLAYER_RANGE:'Nombre de joueurs incohérent',
  ENTRYPOINT_MISSING:'Page de lancement absente, vide ou trop volumineuse',ENTRYPOINT_SIZE_LIMIT:'Page de lancement trop volumineuse',
  ENTRYPOINT_INVALID_UTF8:'Page de lancement non encodée en UTF-8',INVALID_OR_UNSAFE_ARCHIVE:'Structure ZIP invalide',
  ZIP_FORMAT_INVALID:'Archive ZIP corrompue ou illisible',EXTRACTOR_IO_ERROR:'Erreur du disque temporaire',
  EXTRACTOR_PERMISSION_DENIED:'Permission locale refusée au parseur',EXTRACTOR_START_FAILED:'Impossible de démarrer le parseur isolé',
  EXTRACTOR_EXITED:'Arrêt du parseur sans diagnostic exploitable',EXTRACTOR_TIMEOUT:'Extraction interrompue ou délai dépassé',
  EXTRACTOR_RESULT_INVALID:'Résultat du parseur absent ou invalide',EXTRACTOR_ERROR:'Erreur interne non classée du parseur',
  STORAGE_UNAVAILABLE:'Stockage indisponible',DATABASE_UNAVAILABLE:'Échange avec la base interrompu',SCRATCH_SPACE_INSUFFICIENT:'Espace disque temporaire insuffisant',
  VALIDATOR_ERROR:'Incident de validation non déterminé',VERSION_CONFLICT:'Cette version existe déjà',ARTIFACT_CONFLICT:'Artefact existant incohérent',
  GAME_LOAD_FAILED:'Le jeu n’a pas terminé son chargement',SDK_INCOMPATIBLE:'Protocole du lecteur incompatible',
} as const
export const VALIDATION_PHASES=['scratch','download','extract','checkpoint','artifacts','complete','playtest'] as const
export type ValidationPhase=typeof VALIDATION_PHASES[number]
export type ValidationReason=keyof typeof VALIDATION_REASONS
export type ValidationLocation={path?:string;field?:string}
export type ValidationDiagnostic=ValidationLocation & {version:1;kind:'submission'|'internal'|'infrastructure'|'unknown';reason:ValidationReason;phase?:ValidationPhase}
export function safeValidationLocation(value:ValidationLocation):ValidationLocation{
  const path=value.path
  const safePath=typeof path==='string'&&path.length<=180&&!path.startsWith('/')&&!/^[A-Za-z]:/.test(path)
    &&/^[\p{L}\p{N} ._()/@+-]+$/u.test(path)&&!/[A-Za-z0-9_-]{32,}|(?:npm_|ghp_|github_pat_|eyJ)/.test(path)?path:undefined
  const field=typeof value.field==='string'&&/^(?:\$|\/(?:schemaVersion|integrationVersion|gameId|version|client|capabilities|entrypoints|local|online|players|min|max|requirements|crossOriginIsolation)(?:\/(?:client|capabilities|entrypoints|local|online|players|min|max|requirements|crossOriginIsolation))*)$/.test(value.field)?value.field:undefined
  return {...(safePath?{path:safePath}:{}),...(field?{field}:{})}
}
export function parseValidationDiagnostic(value:unknown):ValidationDiagnostic|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null
  const v=value as Record<string,unknown>
  if(v.version!==1||typeof v.kind!=='string'||!['submission','internal','infrastructure','unknown'].includes(v.kind)||typeof v.reason!=='string'||!Object.hasOwn(VALIDATION_REASONS,v.reason))return null
  return {version:1,kind:v.kind as ValidationDiagnostic['kind'],reason:v.reason as ValidationReason,...(typeof v.phase==='string'&&(VALIDATION_PHASES as readonly string[]).includes(v.phase)?{phase:v.phase as ValidationPhase}:{}),...safeValidationLocation(v as ValidationLocation)}
}
export function describeValidation(diagnostic:ValidationDiagnostic){
  const reason=diagnostic.reason
  const category=diagnostic.kind==='infrastructure'?'infrastructure':diagnostic.kind==='internal'?'internal':diagnostic.kind==='unknown'?'undetermined':
    reason==='FORBIDDEN_ARTIFACT_FILE'?'forbidden_file':reason==='SDK_INCOMPATIBLE'?'sdk':reason==='GAME_LOAD_FAILED'?'loading':
    /MANIFEST|PLAYER_RANGE|UPLOAD_TARGET/.test(reason)?'manifest':/LIMIT|BUILD_FILE_SIZE|BUILD_TOTAL_SIZE|BUILD_PATH_DEPTH/.test(reason)?'limit':'archive'
  const action=category==='forbidden_file'?'Vérifier l’utilisation de ce fichier et préparer une archive corrigée sans fichier de configuration d’hébergement.':
    category==='manifest'?'Corriger chibasko.json selon le format documenté, puis reconstruire le ZIP.':
    category==='limit'?'Réduire les ressources ou la taille des fichiers avant un nouvel envoi.':
    category==='infrastructure'||category==='internal'?'Corriger l’incident puis demander explicitement une nouvelle tentative sur la même archive.':
    category==='undetermined'?'Consulter les détails de la tentative avant de demander une correction au développeur.':
    category==='loading'||category==='sdk'?'Vérifier l’initialisation dans le lecteur sécurisé avant de conclure sur la compatibilité.':
    'Corriger la structure ou les chemins indiqués et transmettre un nouveau ZIP.'
  return {code:reason,category,phase:diagnostic.phase??'extract',explanation:VALIDATION_REASONS[reason],action,...safeValidationLocation(diagnostic)}
}
const prefix='validation_diagnostic:'
export function validationEvent(attempt:number,diagnostic:ValidationDiagnostic){
  if(!Number.isSafeInteger(attempt)||attempt<1||attempt>1000)throw new Error('invalid_diagnostic')
  const safe=parseValidationDiagnostic(diagnostic);if(!safe)throw new Error('invalid_diagnostic')
  return prefix+JSON.stringify({attempt,...safe})
}
export function parseValidationEvent(action:string){
  if(typeof action!=='string'||!action.startsWith(prefix)||action.length>2048)return null
  try{const v=JSON.parse(action.slice(prefix.length)),diagnostic=parseValidationDiagnostic(v)
    return diagnostic&&Number.isSafeInteger(v.attempt)&&v.attempt>0&&v.attempt<=1000?{attempt:v.attempt,diagnostic}:null
  }catch{return null}
}
export function parsePlaytestEvent(action:string){
  if(typeof action!=='string'||!action.startsWith('playtest_diagnostic:')||action.length>1024)return null
  try{
    const value=JSON.parse(action.slice('playtest_diagnostic:'.length))
    if(value.version!==1||value.phase!=='playtest'||value.reason!=='GAME_LOAD_FAILED'||!['hello_timeout','handshake_timeout','game_ready_timeout','launch_expired','launch_unavailable','unexpected_navigation','unknown'].includes(value.code))return null
    return {code:value.code as string}
  }catch{return null}
}

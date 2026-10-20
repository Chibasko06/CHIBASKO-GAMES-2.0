import {UploadError} from '../../lib/game-distribution/uploads/policy'
import {R2ConfigurationError,R2RequestError} from '../../lib/game-distribution/uploads/r2'
const descriptions:Record<string,string>={
 unauthorized:'Accès Supabase refusé : vérifier la credential serveur locale.',
 forbidden:'Permission refusée : vérifier les droits serveur et les RPC installées.',
 upload_not_found:'Upload introuvable dans le projet Supabase configuré.',
 invalid_state:'Le build ne peut pas être validé dans son état actuel. Vérifier son statut et une éventuelle validation déjà active.',
 database_error:'Échec Supabase : consulter le diagnostic distribution_rpc_failed (opération, statut HTTP et code sûr).',
 service_unavailable:'Configuration serveur indisponible.',
 validation_failed:'La validation n’a pas terminé avec une version validée. Consulter le résultat technique dans l’administration.',
 validation_timeout:'Délai de validation dépassé.',
 validator_stopping:'Validation interrompue ; la reprise reste gérée par le claim et la lease existants.',
 storage_error:'Accès au stockage impossible : vérifier les permissions des buckets et le diagnostic R2.',
 lease_lost:'Le claim de validation n’est plus disponible. Vérifier une éventuelle exécution concurrente.'
}
export function reviewFailureMessage(error:unknown,phase:string){
 if(error instanceof R2ConfigurationError)return 'review_storage_configuration: variables manquantes : '+error.configuration.missing.join(', ')+' ; variables invalides : '+error.configuration.invalid.join(', ')
 if(error instanceof R2RequestError)return 'review_storage_error: '+error.diagnostic.action+' / '+error.diagnostic.kind+(error.diagnostic.upstreamStatus?' / HTTP '+error.diagnostic.upstreamStatus:'')
 if(phase==='scratch_setup')return 'review_scratch_unavailable: impossible de préparer ou écrire le répertoire temporaire local.'
 if(phase==='cleanup')return 'review_cleanup_failed: nettoyage temporaire incomplet. Vérifier le résultat du build avant de relancer.'
 const code=error instanceof UploadError&&Object.hasOwn(descriptions,error.code)?error.code:'review_failed'
 return code+': '+(descriptions[code]??'Échec local pendant '+phase+'. Consulter le statut du build et les diagnostics sûrs.')
}

import {effectiveIntegration} from './game-distribution/integration'
import type {GameBuildManifest} from './game-distribution/types'

export type CatalogueRuntime = {
  version: string
  integration: 'classic'|'sdk'
  declaredOnline: readonly ('public'|'private')[]
  availableOnline: ('public'|'private')[]
  availabilityUnknown: boolean
}
export function catalogueRuntime(version:string,manifest:GameBuildManifest):CatalogueRuntime {
  return {version,integration:effectiveIntegration(manifest),
    declaredOnline:manifest.capabilities.online?.access??[],availableOnline:[],availabilityUnknown:false}
}
export function catalogueGameLabels(game:{
  active_version_id?:string|null;external_revision_id?:string|null;game_url?:string|null
  runtime?:CatalogueRuntime|null
}){
  if(game.active_version_id){
    const runtime=game.runtime
    return {
      hosting:'Chibasko Games (R2)',
      integration:runtime?.integration==='sdk'?'SDK Chibasko Games':runtime?'HTML5 classique':'Intégration inconnue',
      multiplayer:!runtime||runtime.availabilityUnknown?'Disponibilité non vérifiée':
        runtime.availableOnline.length?'Multijoueur Chibasko Games disponible ('+runtime.availableOnline.map(access=>access==='public'?'public':'privé').join(', ')+')':
        runtime.declaredOnline.length?'Multijoueur déclaré, indisponible':'Aucun multijoueur Chibasko Games déclaré',
    }
  }
  const external=Boolean(game.external_revision_id||game.game_url)
  return {hosting:game.external_revision_id?'Externe · révision examinée':external?'Externe · intégration historique':'En attente de build',
    integration:external?'HTML5 classique':'Aucune version active',
    multiplayer:external?'Sans services multijoueurs Chibasko Games':'Aucune capacité active'}
}

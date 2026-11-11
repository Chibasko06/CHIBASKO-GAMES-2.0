import type {GameBuildManifest} from './types'
export type IntegrationMode='classic'|'sdk'
export const effectiveIntegration=(manifest:GameBuildManifest):IntegrationMode=>manifest.integration?.mode??'sdk'
export type IntegrationReport={declaredMode:IntegrationMode|null;declaredVersion:string|null;scan:{signals:boolean;complete:boolean;bytes:number}|null;observation:{mode:IntegrationMode;protocol:1|2|null;at:string}|null}
export function integrationLabel(report?:IntegrationReport|null){
 if(report?.observation?.mode==='classic')return 'HTML5 classique — chargement observé, sans SDK requis'
 if(report?.observation?.mode==='sdk')return 'SDK Chibasko Games — dialogue confirmé, version indéterminée'
 if(report?.declaredMode==='classic')return 'HTML5 classique — déclaré, test non effectué'
 return 'Indéterminée — initialisation SDK non observée'
}

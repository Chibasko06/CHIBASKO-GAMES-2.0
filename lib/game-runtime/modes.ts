import type {GameCapabilities} from '@chibaskogames/sdk'
export type PlayerMode='local'|'public'|'private'
export function playerModes(capabilities:GameCapabilities|undefined,availableAccess:readonly ('public'|'private')[]){
  return [
    ...(capabilities?.local?[{id:'local' as const,label:'Jouer en local',description:'Sur le même appareil',available:true}]:[]),
    ...(capabilities?.online?.access.map(id=>({id,label:id==='public'?'Jouer en ligne':'Partie privée',description:availableAccess.includes(id)?id==='public'?'Rejoindre un salon public':'Créer ou rejoindre un salon privé':'Serveur indisponible',available:availableAccess.includes(id)}))??[]),
  ]
}
export function initialPlayerMode(capabilities:GameCapabilities|undefined,availableAccess:readonly ('public'|'private')[]):PlayerMode|null{
  const playable=playerModes(capabilities,availableAccess).filter(mode=>mode.available)
  return playable.length===1?playable[0].id:null
}

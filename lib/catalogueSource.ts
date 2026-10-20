export function catalogueSource(game:{catalogue_source?:string|null;provider_name?:string|null}){
  return game.catalogue_source==='developer_submission'
    ? {label:'Source',value:'Soumission développeur'}
    : {label:'Provider',value:game.provider_name||'Non renseigné'}
}

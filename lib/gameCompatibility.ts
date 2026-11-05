export type GameCompatibility='desktop'|'mobile'|'both'|'unknown'
export type DiscoveryDevice='all'|'desktop'|'mobile'
export const compatibilityLabels:Record<GameCompatibility,string>={desktop:'Compatible ordinateur',mobile:'Compatible mobile',both:'Compatible sur les deux',unknown:'Compatibilité à vérifier'}
export function gameCompatibility(value:string|boolean|null|undefined):GameCompatibility{
 if(value===true)return 'both'
 if(value===false)return 'desktop'
 const text=(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()
 if(/^platform:(desktop|mobile|both|unknown)$/.test(text))return text.slice(9) as GameCompatibility
 if(['oui','yes','true','compatible','mobile compatible','compatible mobile','tactile','touch','smartphone'].includes(text))return 'both'
 if(['non','no','false','pc','pc uniquement','desktop only','ordinateur','ordinateur uniquement','clavier','souris'].includes(text))return 'desktop'
 const mobile=['yes','oui','true','mobile','smartphone','touch','tactile','compatible'].filter(word=>text.includes(word)).length
 const desktop=['no','non','false','pc','desktop','ordinateur','clavier','souris'].filter(word=>text.includes(word)).length
 return mobile>desktop?'both':desktop>mobile?'desktop':'unknown'
}
export function supportsDevice(value:string|boolean|null|undefined,device:DiscoveryDevice){const kind=gameCompatibility(value);return device==='all'||kind==='both'||kind===device}
export function isCompatibilityDeclaration(value:unknown):value is Exclude<GameCompatibility,'unknown'>{return value==='desktop'||value==='mobile'||value==='both'}
export const mobileCompatibilityHelp='Le jeu doit proposer des commandes tactiles, une interface lisible sur téléphone et une alternative à tout clavier obligatoire. Vérifie son fonctionnement en portrait ou paysage. Cette déclaration reste soumise à la revue administrative.'

export function initialDevice(userAgent:string,hint:string|null,cookie:string|undefined):DiscoveryDevice{
 if(cookie==='desktop'||cookie==='mobile'||cookie==='all')return cookie
 if(/bot|crawler|spider/i.test(userAgent))return 'all'
 if(hint==='?1'||/Android|iPhone|iPad|Mobile|Tablet/i.test(userAgent))return 'mobile'
 return 'all'
}

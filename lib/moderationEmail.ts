import {reportCategories,type ReportKind} from './moderation'

export function reportReason(kind:ReportKind,category:string){
 return (reportCategories[kind] as Record<string,string>)[category]??'Autre'
}
export const moderationAccountNavigation='Vous pouvez également retrouver vos avertissements et sanctions à tout moment depuis votre Dashboard → Paramètres avancés → Mes avertissements et sanctions.'

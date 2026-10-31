export type MeasureSummary={id:string;subject:string;action:string;reason:string;created_at:string;ends_at:string|null;archived_at:string|null;version:number;actor_name:string|null;actor_reference:string;kind:'player'|'game';target:string|null;name:string|null;current_version:number;blocked:boolean;protected:boolean;state:string;next:{id:string;action:string;created_at:string}|null}
export type MeasureDetail=MeasureSummary&{note:string|null;case_id:string|null;case_number:number|null;appeal:{id:string;state:string;created_at:string;reviewed_at:string|null}|null}
export type AppealDetail={id:string;version:number;state:string;description:string;decision:string|null;created_at:string;reviewed_at:string|null;username:string|null;author:string|null;reviewer_name:string|null;reviewer_reference:string|null;measure:MeasureSummary}
export type Delivery={id:string;kind:string;state:string;attempts:number;created_at:string;recipient:string|null;recipient_name:string|null}
export type ReadPage<T>={items:T[];hasMore:boolean}
export const measureStates:Record<string,string>={active:'Active',expired:'Expirée',lifted:'Levée',warning:'Avertissement',replaced:'Remplacée',recorded:'Décision de rétablissement',unavailable:'Cible supprimée',closed:'Terminée'}
export const appealStates:Record<string,string>={pending:'En attente',accepted:'Accepté',rejected:'Rejeté'}
export const deliveryStates:Record<string,string>={pending:'En attente d’envoi',sent:'Accepté par Resend',attention_required:'Intervention nécessaire'}
export const deliveryKinds:Record<string,string>={admin:'Alerte de recours à l’administration',receipt:'Décision sur le recours',decision:'Notification de la mesure'}
export const moderationDate=(value:string)=>new Date(value).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'})
export const targetModerationPath=(item:MeasureSummary)=>'/admin/moderation?view=measures&'+(item.target?'kind='+item.kind+'&target='+item.target:'subject='+item.subject)

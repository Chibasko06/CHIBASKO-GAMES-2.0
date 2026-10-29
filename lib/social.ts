import type {ProfileRoles} from '@/lib/profileRoles'
import {fetchJson} from '@/lib/asyncOperation'
import {isPublicUsername} from '@/lib/publicUsername'

export type SocialKind='friends'|'incoming'|'outgoing'|'blocked'
export type SocialAction='request'|'accept'|'reject'|'cancel'|'remove'|'block'|'unblock'
export type Relation={state:'none'|'friends'|'incoming'|'outgoing'|'blocked'|'unavailable'|'self';relationId:string|null}
export type SocialProfile={id:string;username:string;avatar_url:string|null;roles?:ProfileRoles}
export type SocialEntry={id:string;createdAt:string;profile:SocialProfile}
export type SocialCursor={createdAt:string;id:string}
export type SocialPage={items:SocialEntry[];nextCursor:SocialCursor|null}
export type SocialChange={action:SocialAction|'refresh';target:string;relation:Relation}
export const socialButton='inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-cyan-600 focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50'
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const states=['none','friends','incoming','outgoing','blocked','unavailable','self']
const record=(value:unknown):Record<string,unknown>=>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Réponse sociale invalide.')
 return value as Record<string,unknown>
}
export function parseRelation(value:unknown):Relation{
 const item=record(value)
 if(typeof item.state!=='string'||!states.includes(item.state)||(item.relationId!==null&&(typeof item.relationId!=='string'||!uuid.test(item.relationId)))
  ||(['friends','incoming','outgoing'].includes(item.state)&&item.relationId===null))throw Error('Réponse sociale invalide.')
 return {state:item.state as Relation['state'],relationId:item.relationId as string|null}
}
export function parseSocialPage(value:unknown):SocialPage{
 const page=record(value)
 const cursor=(value:unknown):SocialCursor=>{
  const item=record(value)
  if(typeof item.id!=='string'||!uuid.test(item.id)||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw Error('Pagination sociale invalide.')
  return {id:item.id,createdAt:item.createdAt}
 }
 if(!Array.isArray(page.items)||page.items.length>20)throw Error('Liste sociale invalide.')
 const items=page.items.map(value=>{
  const item=record(value),position=cursor(value),p=record(item.profile)
  if(typeof p.id!=='string'||!uuid.test(p.id)||typeof p.username!=='string'||!isPublicUsername(p.username)||(p.avatar_url!==null&&typeof p.avatar_url!=='string'))throw Error('Profil social invalide.')
  const roles=p.roles===undefined?undefined:record(p.roles)
  if(roles&&(typeof roles.admin!=='boolean'||typeof roles.developer!=='boolean'))throw Error('Badges invalides.')
  return {...position,profile:{id:p.id,username:p.username,avatar_url:p.avatar_url,roles:roles?{admin:roles.admin as boolean,developer:roles.developer as boolean}:undefined}} as SocialEntry
 })
 if(new Set(items.map(item=>item.id)).size!==items.length)throw Error('Liste sociale dupliquée.')
 return {items,nextCursor:page.nextCursor===null?null:cursor(page.nextCursor)}
}
export class SocialApiError extends Error{
 constructor(readonly status:number,message:string){super(message)}
}
async function call(url:string,token:string,body?:unknown){
 const {response,payload}=await fetchJson(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 if(!response.ok)throw new SocialApiError(response.status,typeof payload.error==='string'?payload.error:'Les données sociales sont temporairement indisponibles.')
 return payload as unknown
}
export async function readSocialRelation(token:string,target:string){return parseRelation(await call('/api/social?'+new URLSearchParams({target}),token))}
export async function readSocialPage(token:string,kind:SocialKind,cursor:SocialCursor|null=null){
 return parseSocialPage(await call('/api/social?'+new URLSearchParams({kind,...(cursor?{before:cursor.createdAt,cursor:cursor.id}:{})}),token))
}
export async function changeSocialRelation(token:string,target:string,action:SocialAction,relationId:string|null){
 return parseRelation(await call('/api/social',token,{target,action,operationId:crypto.randomUUID(),...(relationId?{relationId}:{})}))
}

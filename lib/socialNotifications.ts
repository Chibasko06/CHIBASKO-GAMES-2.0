import {fetchJson} from '@/lib/asyncOperation'
import {parseSocialPage,type SocialCursor,type SocialChange} from '@/lib/social'
import {isPublicUsername} from '@/lib/publicUsername'

export type NotificationItem={id:string;createdAt:string;kind:'friend_request'|'friend_accepted'|'game_shared';read:boolean;actionable:boolean;relationId:string|null;sender:{id:string;username:string};game:{slug:string;title:string}|null}
export type NotificationPage={items:NotificationItem[];nextCursor:SocialCursor|null;unreadCount:number;readIds:string[]}
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Réponse invalide.');return value as Record<string,unknown>}
export function parseUnread(value:unknown){if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>10)throw Error('Compteur invalide.');return value}
export function parseNotificationPage(value:unknown):NotificationPage{
 const page=object(value)
 function position(value:unknown):SocialCursor{const item=object(value);if(typeof item.id!=='string'||!uuid.test(item.id)||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt)))throw Error('Pagination invalide.');return {id:item.id,createdAt:item.createdAt}}
 if(!Array.isArray(page.items)||page.items.length>20||!Array.isArray(page.readIds)||page.readIds.length>200||page.readIds.some(id=>typeof id!=='string'||!uuid.test(id)))throw Error('Liste invalide.')
 const items=page.items.map(value=>{
  const item=object(value),sender=object(item.sender),game=item.game===null?null:object(item.game)
  if(!['friend_request','friend_accepted','game_shared'].includes(String(item.kind))||typeof item.read!=='boolean'||typeof item.actionable!=='boolean'
   ||typeof sender.id!=='string'||!uuid.test(sender.id)||typeof sender.username!=='string'||!isPublicUsername(sender.username)
   ||(item.relationId!==null&&(typeof item.relationId!=='string'||!uuid.test(item.relationId)))
   ||(game&&(typeof game.slug!=='string'||game.slug.length<1||game.slug.length>256||/[\/\\?#\u0000-\u0020]/.test(game.slug)||['.','..'].includes(game.slug)||typeof game.title!=='string'))
   ||(item.actionable&&(item.kind!=='friend_request'||item.relationId===null)))throw Error('Notification invalide.')
  return {...position(item),kind:item.kind,read:item.read,actionable:item.actionable,relationId:item.relationId,sender:{id:sender.id,username:sender.username},game:game?{slug:game.slug,title:game.title}:null} as NotificationItem
 })
 if(new Set(items.map(item=>item.id)).size!==items.length)throw Error('Notifications dupliquées.')
 return {items,nextCursor:page.nextCursor===null?null:position(page.nextCursor),unreadCount:parseUnread(page.unreadCount),readIds:page.readIds as string[]}
}
export async function notificationCall(token:string,view:string,body?:unknown,cursor:SocialCursor|null=null,search?:string){
 const query=new URLSearchParams({view,...(cursor?{before:cursor.createdAt,cursor:cursor.id}:{}),...(search!==undefined?{search}:{})})
 const {response,payload}=await fetchJson('/api/social/notifications?'+query,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})})
 if(!response.ok)throw Error(typeof payload.error==='string'?payload.error:'Action indisponible.')
 return payload.data as unknown
}
export const readNotifications=async(token:string,kind='all',cursor:SocialCursor|null=null)=>parseNotificationPage(await notificationCall(token,kind,undefined,cursor))
export const readShareFriends=async(token:string,search:string,cursor:SocialCursor|null=null)=>parseSocialPage(await notificationCall(token,'friends',undefined,cursor,search))
export type SocialUpdate={actorId:string;source:'profile'|'bell';change:SocialChange}
export function emitSocialUpdate(detail:SocialUpdate){window.dispatchEvent(new CustomEvent('chibasko:social-change',{detail}))}

export function notificationReadTime(){return performance.now()}

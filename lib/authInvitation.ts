import {safeAuthNext} from './authRedirect'

export type AuthInvitationRequest={reason:string;next:string;trigger:HTMLElement|null;host:HTMLElement;player:boolean}
let current:AuthInvitationRequest|null=null
const listeners=new Set<()=>void>()
export const authInvitationSnapshot=()=>current
export const authInvitationServerSnapshot=()=>null
export function subscribeAuthInvitation(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener)}}
export function closeAuthInvitation(){if(current){current=null;for(const listener of listeners)listener()}}

/** Une invitation n’accorde aucun droit et ne rejoue jamais l’action après connexion. */
export function requestAuthentication(reason='Connectez-vous pour effectuer cette action.',trigger?:HTMLElement){
 if(typeof document==='undefined')return
 if(current)return
 const doc=trigger?.ownerDocument??document,win=doc.defaultView!
 const origin=trigger??(doc.activeElement instanceof win.HTMLElement?doc.activeElement:null)
 const player=origin?.closest<HTMLElement>('[data-expansion]')
 const fullscreen=(doc.fullscreenElement??(doc as Document&{webkitFullscreenElement?:Element;webkitCurrentFullScreenElement?:Element}).webkitFullscreenElement??(doc as Document&{webkitCurrentFullScreenElement?:Element}).webkitCurrentFullScreenElement) as HTMLElement|null
 current={reason,next:safeAuthNext(win.location.pathname+win.location.search),trigger:origin,host:player??fullscreen??doc.body,player:!!player}
 for(const listener of listeners)listener()
}

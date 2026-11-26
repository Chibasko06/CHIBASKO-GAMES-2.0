'use client'
import {useEffect,useId,useRef,useSyncExternalStore} from 'react'
import {createPortal} from 'react-dom'
import {usePathname} from 'next/navigation'
import {useAuth} from '@/components/AuthProvider'
import AuthActions from './AuthActions'
import {authInvitationSnapshot,authInvitationServerSnapshot,subscribeAuthInvitation,closeAuthInvitation,type AuthInvitationRequest} from '@/lib/authInvitation'
import styles from './AuthInvitation.module.css'

export default function AuthInvitationHost(){
 const request=useSyncExternalStore(subscribeAuthInvitation,authInvitationSnapshot,authInvitationServerSnapshot)
 const pathname=usePathname(),{session}=useAuth()
 useEffect(()=>{closeAuthInvitation()},[pathname,session])
 useEffect(()=>()=>closeAuthInvitation(),[])
 return request?createPortal(<Invitation request={request}/>,request.host):null
}
function Invitation({request}:{request:AuthInvitationRequest}){
 const ref=useRef<HTMLDialogElement>(null),id=useId()
 useEffect(()=>{
  const dialog=ref.current!,doc=dialog.ownerDocument,win=doc.defaultView!,scroll={x:win.scrollX,y:win.scrollY},restores:Array<()=>void>=[]
  const style=(node:HTMLElement,key:string,value:string)=>{const before=node.style.getPropertyValue(key),priority=node.style.getPropertyPriority(key);node.style.setProperty(key,value);restores.push(()=>{if(before)node.style.setProperty(key,before,priority);else node.style.removeProperty(key)})}
  // Le verrou existant du lecteur garde la maîtrise du document immersif.
  const ownsScrollLock=doc.body.style.position!=='fixed'
  if(ownsScrollLock){
   const width=doc.body.getBoundingClientRect().width
   for(const [key,value]of Object.entries({position:'fixed',top:-scroll.y+'px',left:-scroll.x+'px',width:width+'px'}))style(doc.body,key,value)
   for(const node of [doc.body,doc.documentElement])for(const axis of ['x','y'])style(node,'overflow-'+axis,'hidden')
  }
  const fit=()=>{const v=win.visualViewport;for(const [key,value]of Object.entries({width:v?.width??win.innerWidth,height:v?.height??win.innerHeight,left:v?.offsetLeft??0,top:v?.offsetTop??0}))dialog.style.setProperty('--auth-'+key,value+'px')}
  fit();dialog.showModal();dialog.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true})
  win.addEventListener('resize',fit);win.visualViewport?.addEventListener('resize',fit);win.visualViewport?.addEventListener('scroll',fit)
  const observer=new MutationObserver(()=>{if(!request.host.isConnected)closeAuthInvitation()});observer.observe(doc.body,{childList:true,subtree:true})
  const escape=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeAuthInvitation()}
   if(event.key==='Tab'){
    const controls=Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href]')).filter(node=>node.getClientRects().length)
    if(controls.length){event.preventDefault();const index=controls.indexOf(doc.activeElement as HTMLElement);controls[(index+(event.shiftKey?-1:1)+controls.length)%controls.length].focus()}
   }
  }
  dialog.addEventListener('keydown',escape)
  const navigation=()=>closeAuthInvitation();win.addEventListener('popstate',navigation)
  return()=>{
   observer.disconnect();dialog.removeEventListener('keydown',escape);win.removeEventListener('popstate',navigation);win.removeEventListener('resize',fit);win.visualViewport?.removeEventListener('resize',fit);win.visualViewport?.removeEventListener('scroll',fit);dialog.close()
   for(const restore of restores.reverse())restore()
   if(ownsScrollLock){const old=doc.documentElement.style.scrollBehavior;doc.documentElement.style.scrollBehavior='auto';win.scrollTo(scroll.x,scroll.y);doc.documentElement.style.scrollBehavior=old}
   const trigger=request.trigger
   if(trigger?.isConnected&&!trigger.closest('[inert]')){const fallback=trigger.closest('details')?.querySelector('summary')??trigger.closest('[data-expansion]')?.querySelector('[data-player-menu]');(trigger.getClientRects().length?trigger:fallback as HTMLElement|null)?.focus({preventScroll:true})}
  }
 },[request])
 return <dialog ref={ref} data-auth-invitation className={styles.dialog} aria-labelledby={id+'-title'} aria-describedby={id+'-reason '+id+'-note'} onCancel={event=>{event.preventDefault();closeAuthInvitation()}} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeAuthInvitation()}}}>
  <div className={styles.header}><h2 id={id+'-title'}>Un compte pour participer</h2><button className={styles.close} type="button" onClick={closeAuthInvitation} aria-label="Fermer l’invitation">✕</button></div>
  <p id={id+'-reason'}>{request.reason}</p>
  <p id={id+'-note'} className={styles.note}>{request.player?'Fermer cette invitation conserve la partie. Aller à la connexion ou à l’inscription quitte cette page et peut interrompre la partie.':'Vous pourrez revenir à cette page après authentification. L’action devra être effectuée à nouveau.'}</p>
  <AuthActions next={request.next}/>
 </dialog>
}

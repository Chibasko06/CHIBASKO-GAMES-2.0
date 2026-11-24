export type PlayerExpansionMode='inline'|'native'|'immersive'
type FullscreenDocument=Document&{webkitFullscreenElement?:Element|null;webkitCurrentFullScreenElement?:Element|null;webkitFullscreenEnabled?:boolean;webkitExitFullscreen?:()=>void;webkitCancelFullScreen?:()=>void}
type FullscreenElement=HTMLElement&{webkitRequestFullscreen?:()=>void;webkitRequestFullScreen?:()=>void}
const immersiveOwners=new WeakMap<Document,(restoreFocus?:boolean)=>void>()

/** Le lecteur reste dans le même arbre DOM : aucune opération sur l’iframe. */
export function createPlayerExpansion(element:HTMLElement,onChange:(mode:PlayerExpansionMode)=>void,onError:()=>void){
 const doc=element.ownerDocument as FullscreenDocument,win=doc.defaultView!
 let mode:PlayerExpansionMode='inline',disposed=false,busy=false,generation=0,requested=false
 let releaseImmersive:((restoreFocus?:boolean)=>void)|undefined,cancelRequest:(()=>void)|undefined
 const nativeElement=()=>doc.fullscreenElement??doc.webkitFullscreenElement??doc.webkitCurrentFullScreenElement??null
 const ownsNative=()=>nativeElement()===element
 const focusControl=()=>{if(element.isConnected)element.querySelector<HTMLButtonElement>('[data-player-expand]')?.focus({preventScroll:true})}
 const setMode=(value:PlayerExpansionMode)=>{mode=value;element.dataset.expansion=value;if(value==='inline')delete element.dataset.nativeApi;if(!disposed)onChange(value)}
 function nativeExit(){const exit=doc.fullscreenElement===element?doc.exitFullscreen:doc.webkitExitFullscreen??doc.webkitCancelFullScreen??doc.exitFullscreen;return typeof exit==='function'?Promise.resolve(exit.call(doc)):Promise.reject(new Error('fullscreen_exit_unavailable'))}
 function sync(){
  if(ownsNative()){
   if(!requested||disposed){void nativeExit().catch(()=>{});return}
   const family=element.dataset.nativeApi
   releaseImmersive?.(false);if(family)element.dataset.nativeApi=family;requested=true;setMode('native')
  }else if(mode==='native'){requested=false;setMode('inline');focusControl()}
 }
 for(const name of ['fullscreenchange','webkitfullscreenchange'])doc.addEventListener(name,sync)

 function enterImmersive(){
  immersiveOwners.get(doc)?.(false)
  const undo:Array<()=>void>=[],hidden=new Set<HTMLElement>(),scroll={x:win.scrollX,y:win.scrollY}
  let stopped=false,frame=0
  function style(node:HTMLElement,name:string,value:string){
   // Les raccourcis CSS effaceraient les valeurs initiales définies sur un seul axe.
   if(name==='overflow'||name==='overscroll-behavior'){style(node,name+'-x',value);style(node,name+'-y',value);return}
   const previous=node.style.getPropertyValue(name),priority=node.style.getPropertyPriority(name);node.style.setProperty(name,value,'important');undo.push(()=>{if(previous)node.style.setProperty(name,previous,priority);else node.style.removeProperty(name)})
  }
  function attribute(node:HTMLElement,name:string,value:string){const previous=node.getAttribute(name);node.setAttribute(name,value);undo.push(()=>{if(previous===null)node.removeAttribute(name);else node.setAttribute(name,previous)})}
  function hide(node:HTMLElement){if(hidden.has(node))return;hidden.add(node);style(node,'visibility','hidden');style(node,'opacity','0');style(node,'pointer-events','none');attribute(node,'inert','');attribute(node,'aria-hidden','true')}
  const chain:Array<{parent:HTMLElement;child:HTMLElement}>=[]
  let child=element,parent=element.parentElement
  while(parent){chain.push({parent,child});if(parent===doc.body)break;child=parent;parent=parent.parentElement}
  const hideSiblings=()=>{for(const {parent,child}of chain)for(const sibling of parent.children)if(sibling!==child&&sibling instanceof win.HTMLElement)hide(sibling)}
  const observer=new win.MutationObserver(hideSiblings)
  const viewport=()=>{
   if(stopped)return
   const visual=win.visualViewport
   element.style.setProperty('--player-view-width',`${visual?.width??win.innerWidth}px`)
   element.style.setProperty('--player-view-height',`${visual?.height??win.innerHeight}px`)
   element.style.setProperty('--player-view-left',`${visual?.offsetLeft??0}px`)
   element.style.setProperty('--player-view-top',`${visual?.offsetTop??0}px`)
  }
  const schedule=()=>{if(!frame)frame=win.requestAnimationFrame(()=>{frame=0;viewport()})}
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();leaveImmersive()}}
  const containFocus=(event:FocusEvent)=>{if(event.target instanceof win.Node&&!element.contains(event.target))focusControl()}
  const leaveImmersive=(restoreFocus=true)=>{
   if(stopped)return;stopped=true
   observer.disconnect();win.cancelAnimationFrame(frame)
   win.removeEventListener('resize',schedule);win.removeEventListener('orientationchange',schedule)
   win.visualViewport?.removeEventListener('resize',schedule);win.visualViewport?.removeEventListener('scroll',schedule)
   doc.removeEventListener('keydown',escape,true);doc.removeEventListener('focusin',containFocus)
   for(const restore of undo.reverse())restore()
   // Désactive le scroll animé uniquement pendant la restitution de la position.
   const old=doc.documentElement.style.getPropertyValue('scroll-behavior'),priority=doc.documentElement.style.getPropertyPriority('scroll-behavior')
   doc.documentElement.style.setProperty('scroll-behavior','auto','important');win.scrollTo(scroll.x,scroll.y)
   if(old)doc.documentElement.style.setProperty('scroll-behavior',old,priority);else doc.documentElement.style.removeProperty('scroll-behavior')
   if(immersiveOwners.get(doc)===leaveImmersive)immersiveOwners.delete(doc)
   releaseImmersive=undefined
   if(mode==='immersive'){requested=false;setMode('inline')}
   if(restoreFocus)focusControl()
  }
  releaseImmersive=leaveImmersive;immersiveOwners.set(doc,leaveImmersive)
  try{
   for(const {parent}of chain)if(parent!==doc.body){
    for(const [name,value]of Object.entries({position:'relative','z-index':'2147483646',isolation:'auto',transform:'none',filter:'none','backdrop-filter':'none',perspective:'none',contain:'none','container-type':'normal','content-visibility':'visible',overflow:'visible','clip-path':'none','mask-image':'none','will-change':'auto'}))style(parent,name,value)
   }
   hideSiblings();for(const {parent}of chain)observer.observe(parent,{childList:true})
   style(doc.documentElement,'overflow','hidden');style(doc.documentElement,'overscroll-behavior','none')
   for(const [name,value]of Object.entries({position:'fixed',top:`-${scroll.y}px`,left:`-${scroll.x}px`,width:'100%',overflow:'hidden','overscroll-behavior':'none'}))style(doc.body,name,value)
   for(const name of ['--player-view-width','--player-view-height','--player-view-left','--player-view-top']){const value=element.style.getPropertyValue(name),priority=element.style.getPropertyPriority(name);undo.push(()=>{if(value)element.style.setProperty(name,value,priority);else element.style.removeProperty(name)})}
   attribute(element,'role','dialog');attribute(element,'aria-modal','true');viewport()
   win.addEventListener('resize',schedule);win.addEventListener('orientationchange',schedule)
   win.visualViewport?.addEventListener('resize',schedule);win.visualViewport?.addEventListener('scroll',schedule)
   doc.addEventListener('keydown',escape,true);doc.addEventListener('focusin',containFocus)
   setMode('immersive');focusControl()
  }catch(error){leaveImmersive(false);throw error}
 }
 function requestNative(){
  const target=element as FullscreenElement
  const standard=typeof target.requestFullscreen==='function'
  const request=standard?target.requestFullscreen:target.webkitRequestFullscreen??target.webkitRequestFullScreen
  const exit=standard?doc.exitFullscreen:doc.webkitExitFullscreen??doc.webkitCancelFullScreen
  if(typeof request!=='function'||typeof exit!=='function'||(standard?doc.fullscreenEnabled:doc.webkitFullscreenEnabled)===false)return Promise.resolve(false)
  element.dataset.nativeApi=standard?'standard':'webkit'
  return new Promise<boolean>(resolve=>{
   let done=false
   const finish=(ok:boolean)=>{if(done)return;done=true;win.clearTimeout(timer);doc.removeEventListener('fullscreenchange',change);doc.removeEventListener('webkitfullscreenchange',change);doc.removeEventListener('fullscreenerror',failed);doc.removeEventListener('webkitfullscreenerror',failed);cancelRequest=undefined;resolve(ok)}
   const change=()=>{if(ownsNative())finish(true)},failed=()=>finish(false)
   // Certaines API préfixées ne renvoient pas de promesse ou ne répondent pas.
   const timer=win.setTimeout(()=>finish(ownsNative()),1500)
   cancelRequest=()=>finish(false)
   doc.addEventListener('fullscreenchange',change);doc.addEventListener('webkitfullscreenchange',change);doc.addEventListener('fullscreenerror',failed);doc.addEventListener('webkitfullscreenerror',failed)
   try{const result:unknown=(request as ()=>unknown).call(target);if(ownsNative())finish(true);else if(result&&typeof (result as PromiseLike<unknown>).then==='function')void Promise.resolve(result).then(()=>{if(disposed&&ownsNative())void nativeExit().catch(()=>{});finish(ownsNative())},failed)}catch{failed()}
  })
 }
 async function toggle(){
  if(disposed||busy)return
  const attempt=++generation;busy=true
  try{
   if(mode==='immersive'){requested=false;releaseImmersive?.();return}
   if(ownsNative()){await nativeExit();sync();return}
   requested=true
   const accepted=await requestNative()
   if(disposed||attempt!==generation)return
   if(accepted&&ownsNative())setMode('native');else enterImmersive()
  }catch{if(!disposed)onError()}
  finally{busy=false}
 }
 function dispose(){disposed=true;generation++;requested=false;cancelRequest?.();for(const name of ['fullscreenchange','webkitfullscreenchange'])doc.removeEventListener(name,sync);releaseImmersive?.(false);if(ownsNative())void nativeExit().catch(()=>{})}
 async function exit(){generation++;requested=false;cancelRequest?.();releaseImmersive?.();if(ownsNative()){try{await nativeExit();sync()}catch{if(!disposed)onError()}}}
 return {toggle,exit,dispose}
}

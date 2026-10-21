import {analyticsId,privateLobbyPath} from './multiplayer/analyticsPrivacy'

export type ConsentState=Record<'analytics_storage'|'ad_storage'|'ad_user_data'|'ad_personalization','granted'|'denied'>
export const DENIED_CONSENT:Readonly<ConsentState>=Object.freeze({analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})
// Executed in the document head before any Analytics configuration or external tag.
export const ANALYTICS_CONSENT_DEFAULT_SCRIPT=`(function(w){if(w.__chibaskoConsentDefault)return;w.__chibaskoConsentDefault=true;w.dataLayer=w.dataLayer||[];w.gtag=w.gtag||function(){w.dataLayer.push(arguments)};w[${JSON.stringify('ga-disable-'+analyticsId)}]=true;w.gtag('consent','default',${JSON.stringify(DENIED_CONSENT)});})(window);`

type ModeValues={analyticsStoragePurposeConsentStatus?:number;adStoragePurposeConsentStatus?:number;adUserDataPurposeConsentStatus?:number;adPersonalizationPurposeConsentStatus?:number}
type TcfEvent={eventStatus?:string;cmpStatus?:string;gdprApplies?:boolean}
type GoogleFc={callbackQueue:{push(entry:Record<string,()=>void>):unknown};getGoogleConsentModeValues?:()=>ModeValues}
type ConsentWindow=Window & {__chibaskoConsentDefault?:boolean;dataLayer?:unknown[];gtag?:(...args:unknown[])=>void;googlefc?:GoogleFc;__tcfapi?:(command:string,version:number,callback:(data:TcfEvent,success:boolean)=>void)=>void}

export function googleConsentState(value:ModeValues|undefined):ConsentState{
 // Only the documented GRANTED enum (1) grants access. Unknown, inapplicable,
 // missing and NOT_CONFIGURED values never become implicit user permission.
 const status=(value:number|undefined)=>value===1?'granted':'denied'
 return {analytics_storage:status(value?.analyticsStoragePurposeConsentStatus),ad_storage:status(value?.adStoragePurposeConsentStatus),ad_user_data:status(value?.adUserDataPurposeConsentStatus),ad_personalization:status(value?.adPersonalizationPurposeConsentStatus)}
}

type Controller={setPrivatePage(value:boolean):void}
const controllers=new WeakMap<Window,Controller>()
export function connectAnalyticsConsent(target:Window):Controller{
 const existing=controllers.get(target);if(existing)return existing
 const win=target as ConsentWindow
 let state:ConsentState={...DENIED_CONSENT},privatePage=privateLobbyPath(win.location.pathname),configured=false,subscribed=false,decisionPending=false,revision=0,refreshTimer:number|undefined
 const disabledKey='ga-disable-'+analyticsId
 const allowed=()=>state.analytics_storage==='granted'&&!decisionPending&&!privatePage&&!privateLobbyPath(win.location.pathname)
 function disable(value:boolean){Reflect.set(win,disabledKey,value)}
 function safeUrl(value:string){try{const url=new URL(value);url.search='';url.hash='';url.pathname=url.pathname.replace(/(\/games\/[^/]+\/lobby\/)[^/]+/,'$1private');return url.href}catch{return ''}}
 function configure(){
  disable(!allowed())
  if(!allowed()||configured||!win.__chibaskoConsentDefault)return
  configured=true
  win.gtag?.('js',new Date())
  win.gtag?.('config',analyticsId,{page_location:safeUrl(win.location.href),page_referrer:safeUrl(win.document.referrer)})
  if(!win.document.getElementById('chibasko-google-analytics-tag')){
   const script=win.document.createElement('script');script.id='chibasko-google-analytics-tag';script.async=true
   script.src='https://www.googletagmanager.com/gtag/js?id='+analyticsId
   win.document.head.append(script)
  }
 }
 function apply(next:ConsentState){
  state=next
  // Disable collection before a revocation update can reach an already loaded tag.
  disable(!allowed())
  win.gtag?.('consent','update',next)
  configure()
 }
 const fc:GoogleFc=win.googlefc??{callbackQueue:[]}
 win.googlefc=fc
 fc.callbackQueue=fc.callbackQueue??[]
 function refresh(releasePending=false,expectedRevision?:number){
  fc.callbackQueue.push({CONSENT_MODE_DATA_READY:()=>{
   if(expectedRevision!==undefined&&expectedRevision!==revision)return
   if(releasePending)decisionPending=false
   try{apply(googleConsentState(fc.getGoogleConsentModeValues?.()))}catch{apply({...DENIED_CONSENT})}
  }})
 }
 const controller:Controller={setPrivatePage(value){privatePage=value;configure()}}
 // One subscription/configuration per document, including React StrictMode remounts.
 controllers.set(target,controller)
 disable(true)
 refresh()
 fc.callbackQueue.push({CONSENT_API_READY:()=>{
  if(subscribed||typeof win.__tcfapi!=='function')return
  subscribed=true
  win.__tcfapi('addEventListener',2,(data,success)=>{
   if(!success||data?.cmpStatus==='error'){apply({...DENIED_CONSENT});return}
   if(data.eventStatus==='cmpuishown'){revision++;win.clearTimeout(refreshTimer);decisionPending=true;configure();return}
   if(!['tcloaded','useractioncomplete'].includes(data.eventStatus??''))return
   // Let Funding Choices commit its Consent Mode values before reading them.
   const current=++revision;decisionPending=true;configure()
   win.clearTimeout(refreshTimer);refreshTimer=win.setTimeout(()=>refresh(true,current),0)
  })
 }})
 return controller
}

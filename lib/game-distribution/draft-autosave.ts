import type {DraftMetadata,PublicationDraft} from './submission-drafts'
export type DraftPayload={metadata:DraftMetadata;version:string}
type SaveState={status:'saved'|'pending'|'saving'|'error';code?:string}
export class DraftAutosave{
 private payload:DraftPayload
 private saved:string
 private revision:number
 private timer:ReturnType<typeof setTimeout>|undefined
 private running:Promise<void>|null=null
 private disposed=false
 private listeners=new Set<()=>void>()
 private state:SaveState={status:'saved'}
 constructor(initial:PublicationDraft,private write:(payload:DraftPayload,revision:number)=>Promise<PublicationDraft>,private delay=1000){
   this.payload={metadata:initial.metadata,version:initial.version};this.saved=JSON.stringify(this.payload);this.revision=initial.revision
 }
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
 snapshot=()=>this.state
 get dirty(){return JSON.stringify(this.payload)!==this.saved}
 private publish(state:SaveState){this.state=state;for(const listener of this.listeners)listener()}
 update(payload:DraftPayload){
   this.payload=payload;clearTimeout(this.timer)
   if(!this.dirty){if(!this.running)this.publish({status:'saved'});return}
   if(!this.running)this.publish({status:'pending'})
   this.timer=setTimeout(()=>{void this.flush().catch(()=>{})},this.delay)
 }
 async flush():Promise<void>{
   clearTimeout(this.timer)
   if(this.running){await this.running;if(this.dirty&&!this.disposed)await this.flush();return}
   if(!this.dirty)return
   const payload=this.payload,serialized=JSON.stringify(payload)
   this.publish({status:'saving'})
   this.running=this.write(payload,this.revision).then(result=>{
     this.revision=result.revision;this.saved=serialized;this.publish({status:this.dirty?'pending':'saved'})
   }).catch(error=>{
     this.publish({status:'error',code:error&&typeof error.code==='string'?error.code:'service_unavailable'});throw error
   }).finally(()=>{this.running=null})
   await this.running
   if(this.dirty&&!this.disposed)await this.flush()
 }
 setWriter(write:(payload:DraftPayload,revision:number)=>Promise<PublicationDraft>){this.write=write}
 activate(){this.disposed=false}
 dispose(){this.disposed=true;clearTimeout(this.timer);this.listeners.clear()}
}

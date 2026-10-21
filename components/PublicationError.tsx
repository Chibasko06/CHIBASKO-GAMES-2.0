'use client'
import {createPortal} from 'react-dom'
import {FormFeedback} from './ui/FormFeedback'

export function publicationErrorLocation(code:string){
 if(['invalid_version','version_conflict'].includes(code))return 'version'
 if(['invalid_zip','file_too_large','invalid_archive_size','file_changed'].includes(code))return 'zip'
 if(code==='developer_profile_required')return 'profile'
 return 'upload'
}
export function PublicationError({code,message,version,id,location}:{code:string;message:string;version:string;id:string;location:string}){
 if(!message||publicationErrorLocation(code)!==location)return null
 const title=code==='invalid_version'?'Version invalide':code==='version_conflict'?'Version déjà utilisée':location==='zip'?'Vérifiez le ZIP':location==='profile'?'Fiche développeur à compléter':'Envoi impossible'
 const detail=code==='version_conflict'?`La version ${version} existe déjà pour ce jeu.`:message
 const feedback=<FormFeedback id={id} tone="error" title={title}><p>{detail}</p></FormFeedback>
 const target=location==='profile'&&typeof document!=='undefined'?document.getElementById('developer-contact-errors'):null
 return target?createPortal(feedback,target):feedback
}

export const CONTACT_WINDOW_MS=22*60*60*1000
export const CONTACT_LIMITS={firstName:80,lastName:80,email:254,message:5000} as const
export type ContactFields=keyof typeof CONTACT_LIMITS
export type ContactMessage=Record<ContactFields,string>
export type ContactAttempt={id:string;createdAt:number}
export function contactErrors(value:Record<string,unknown>){
 const errors:Partial<Record<ContactFields,string>>={}
 for(const name of Object.keys(CONTACT_LIMITS) as ContactFields[]){
  const text=value[name]
  if(typeof text!=='string'||!text.trim())errors[name]='Ce champ est obligatoire.'
  else if(text.trim().length>CONTACT_LIMITS[name])errors[name]=`Maximum ${CONTACT_LIMITS[name]} caractères.`
  else if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)||(name!=='message'&&/[\r\n]/.test(text)))errors[name]='Ce champ contient un caractère non autorisé.'
 }
 if(!errors.email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(value.email).trim()))errors.email='Saisis une adresse e-mail valide.'
 return errors
}

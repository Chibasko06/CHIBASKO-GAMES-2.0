import 'server-only'
import {InputError} from './inputValidation'
import {profileFields} from './profileRequest'

export type ProfileSnapshot={username:string;bio:string|null;avatar_url:string|null}

export function adminUserProfile(body:Record<string,unknown>){
 if(Object.keys(body).some(key=>!['username','bio','avatar_url','expected'].includes(key)))throw new InputError('Champ non autorisé.')
 const fields=profileFields({username:body.username,bio:body.bio})
 const avatar=body.avatar_url
 if(avatar!==undefined&&avatar!==null&&typeof avatar!=='string')throw new InputError('URL d’avatar invalide.')
 const avatarUrl=typeof avatar==='string'?avatar.trim():''
 if(avatarUrl){
  try{const url=new URL(avatarUrl);if(avatarUrl.length>2048||url.protocol!=='https:'||url.username||url.password||avatarUrl.includes('\0'))throw Error()}
  catch{throw new InputError('L’avatar doit utiliser une URL HTTPS sans identifiants.')}
 }
 let expected:ProfileSnapshot|undefined
 if(body.expected!==undefined){
  const value=body.expected as ProfileSnapshot
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3
   ||Object.keys(value).some(key=>!['username','bio','avatar_url'].includes(key))||typeof value.username!=='string'
   ||(value.bio!==null&&typeof value.bio!=='string')||(value.avatar_url!==null&&typeof value.avatar_url!=='string'))throw new InputError('Version du profil invalide.')
  expected=value
 }
 return {fields,avatarUrl:avatarUrl||null,expected}
}

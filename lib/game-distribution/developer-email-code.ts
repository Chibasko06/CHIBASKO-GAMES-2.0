import {automaticEmailSender,brandedEmail} from '../brandedEmail'

const encoder=new TextEncoder(),decoder=new TextDecoder()
export type VerificationBinding={actor:string;revision:string;challenge:string}
export type EncryptedEmail={version:1;iv:string;tag:string;ciphertext:string}
function keyBytes(secret:string|undefined){if(!secret||secret.length<32)throw Error('verification_configuration_missing');return encoder.encode(secret)}
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
async function hmac(secret:string|undefined,value:string){const key=await crypto.subtle.importKey('raw',keyBytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode('developer-email/v1/'+value)))}
export function developerDestinationHash(secret:string|undefined,email:string){return hmac(secret,'destination/'+email.trim().toLowerCase())}
export function developerCodeHash(secret:string|undefined,binding:VerificationBinding,code:string){return hmac(secret,'code/'+binding.actor+'/'+binding.revision+'/'+binding.challenge+'/'+code)}
export function generateDeveloperCode(){const n=new Uint32Array(1);do{crypto.getRandomValues(n)}while(n[0]>=4_294_000_000);return (n[0]%1_000_000).toString().padStart(6,'0')}
function base64(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function bytes(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
const aad=(b:VerificationBinding)=>encoder.encode('developer-email/v1/'+b.actor+'/'+b.revision+'/'+b.challenge)
async function aes(secret:string|undefined){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode('developer-email/encryption/v1/'+decoder.decode(keyBytes(secret)))),{name:'AES-GCM'},false,['encrypt','decrypt'])}
export function developerVerificationMessage(email:string,code:string,from:string){
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)||!/^\d{6}$/.test(code))throw Error('invalid_verification_message')
 const subject='Chibasko Games — Vérifiez votre adresse professionnelle'
 const text=['Vérification de votre adresse professionnelle','Votre code : '+code,'Ce code est valable 10 minutes et permet de confirmer l’adresse de votre profil développeur. Ne le partagez pas.','Retournez dans Mon profil développeur pour le saisir.','Si vous n’avez pas demandé ce code, ignorez ce message.'].join('\n\n')
 return {from:automaticEmailSender(from),to:[email],subject,...brandedEmail({identity:'developers',subject,text,code,automatic:'no-reply'})}
}
export async function encryptDeveloperEmail(secret:string|undefined,binding:VerificationBinding,message:ReturnType<typeof developerVerificationMessage>):Promise<EncryptedEmail>{
 const iv=crypto.getRandomValues(new Uint8Array(12)),encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(binding)},await aes(secret),encoder.encode(JSON.stringify(message))))
 return {version:1,iv:base64(iv),tag:base64(encrypted.slice(-16)),ciphertext:base64(encrypted.slice(0,-16))}
}
export async function decryptDeveloperEmail(secret:string|undefined,binding:VerificationBinding,envelope:EncryptedEmail){
 if(envelope?.version!==1||typeof envelope.ciphertext!=='string'||envelope.ciphertext.length>65536)throw Error('invalid_encrypted_email')
 const ciphertext=bytes(envelope.ciphertext),tag=bytes(envelope.tag),joined=new Uint8Array(ciphertext.length+tag.length);joined.set(ciphertext);joined.set(tag,ciphertext.length)
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(envelope.iv),additionalData:aad(binding)},await aes(secret),joined)
 const message=JSON.parse(decoder.decode(plain)) as ReturnType<typeof developerVerificationMessage>
 if(!Array.isArray(message.to)||message.to.length!==1||typeof message.html!=='string'||typeof message.text!=='string')throw Error('invalid_encrypted_email')
 return message
}

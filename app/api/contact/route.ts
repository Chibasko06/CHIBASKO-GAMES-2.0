import {contactRequest} from '@/lib/server/contactRequest'
import {uploadRepository} from '@/lib/game-distribution/uploads/repository'
export async function POST(request:Request){
 const {CONTACT_FORM_ENABLED,CONTACT_NOTIFY_EMAIL,CONTACT_HASH_SECRET,RESEND_API_KEY,RESEND_FROM_EMAIL,CHIBASKO_CLOUDFLARE}=process.env
 return contactRequest(request,{env:{CONTACT_FORM_ENABLED,CONTACT_NOTIFY_EMAIL,CONTACT_HASH_SECRET,RESEND_API_KEY,RESEND_FROM_EMAIL,CHIBASKO_CLOUDFLARE},db:()=>uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??''),log:entry=>console.info(JSON.stringify(entry))})
}

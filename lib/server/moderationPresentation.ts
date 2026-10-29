import 'server-only'
import {withTimeout} from '@/lib/asyncOperation'
import type {ModerationCase} from '@/lib/moderation'

// Enrichissement borné aux dossiers déjà autorisés et paginés par la RPC.
export async function moderationPresentation(result:unknown){
 const page=result as {items?:ModerationCase[]}
 if(!Array.isArray(page?.items)||!page.items.length)return result
 const ids=page.items.map(item=>item.id)
 if(ids.length>20||ids.some(id=>! /^[a-f0-9-]{36}$/i.test(id)))throw Error('moderation_page_invalid')
 const url=new URL('/rest/v1/moderation_cases',process.env.NEXT_PUBLIC_SUPABASE_URL)
 url.searchParams.set('id','in.('+ids.join(',')+')')
 url.searchParams.set('select','id,target_profile:profiles!moderation_cases_target_user_fkey(username),target_game_view:games!moderation_cases_target_game_fkey(title,is_published)')
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY??''
 const response=await withTimeout(fetch(url,{headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(8000)}),8000)
 if(!response.ok)throw Error('moderation_names_unavailable')
 const rows=await withTimeout(response.json(),8000) as {id:string;target_profile:{username:string}|null;target_game_view:{title:string;is_published:boolean}|null}[]
 if(!Array.isArray(rows))throw Error('moderation_names_invalid')
 const names=new Map(rows.map(row=>[row.id,row]))
 return {...page,items:page.items.map(item=>{const row=names.get(item.id);return {...item,target_view:row?.target_profile??(row?.target_game_view?{title:row.target_game_view.title,published:row.target_game_view.is_published}:null)}})}
}

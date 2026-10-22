import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
const url=process.env.NEXT_PUBLIC_SUPABASE_URL
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if(!url||!key){console.error('Configuration manquante : NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');process.exit(1)}

// Only published catalogue fields are read with the public API key. No mutations.
async function readPublishedGames(){
 const rows=[]
 for(let offset=0;offset<10000;offset+=1000){
  const endpoint=new URL('/rest/v1/games',url)
  endpoint.search=new URLSearchParams({select:'slug,title,description,thumbnail_url',is_published:'eq.true',order:'id.asc',limit:'1000',offset:String(offset)})
  const response=await fetch(endpoint,{headers:{apikey:key,Authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)})
  if(!response.ok)throw new Error('catalogue_http_'+response.status)
  const data=await response.json()
  if(!Array.isArray(data))throw new Error('catalogue_response_invalid')
  rows.push(...data)
  if(data.length<1000)return {rows,truncated:false}
 }
 return {rows,truncated:true}
}
function duplicateGroups(rows,field){
 const groups=new Map()
 for(const row of rows){const value=(row[field]??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('fr');if(value){const group=groups.get(value)??[];group.push(row.slug);groups.set(value,group)}}
 return [...groups.values()].filter(group=>group.length>1)
}
try{
 const {rows,truncated}=await readPublishedGames()
 console.log(JSON.stringify({publishedGames:rows.length,truncated,duplicateTitles:duplicateGroups(rows,'title'),duplicateDescriptions:duplicateGroups(rows,'description'),missingDescriptions:rows.filter(row=>!row.description?.trim()).map(row=>row.slug),shortDescriptions:rows.filter(row=>row.description?.trim()&&row.description.trim().length<60).map(row=>row.slug),missingImages:rows.filter(row=>!row.thumbnail_url).map(row=>row.slug)},null,2))
}catch(error){
 console.error(JSON.stringify({event:'seo_catalogue_audit_failed',code:/^catalogue_/.test(error?.message??'')?error.message:error?.name==='TimeoutError'?'timeout':'network_error'}))
 process.exitCode=1
}

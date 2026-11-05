import {getViewerProfilesPage} from '@/lib/server/publicProfiles'

export async function GET(request:Request){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie'}
 const search=(new URL(request.url).searchParams.get('search')??'').trim().replace(/^@/,'').toLowerCase()
 if(!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(search))return Response.json({items:[]},{headers})
 try{
  const page=await getViewerProfilesPage(search,1,'all')
  return Response.json({items:page.items.slice(0,5).map(({username,avatar_url})=>({username,avatar_url}))},{headers})
 }catch{return Response.json({error:'Recherche indisponible. Réessaie dans un instant.'},{status:503,headers})}
}

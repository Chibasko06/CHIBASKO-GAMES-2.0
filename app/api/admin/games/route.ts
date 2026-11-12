import {pageNumber} from '@/lib/pagination'
import {catalogueFailure, type SavedCatalogueGame} from '@/lib/server/adminCatalogue'
import { validateGameCatalogue, CatalogueValidationError } from '@/lib/server/gameCatalogueValidation'
import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../_utils'
import {catalogueRuntime} from '@/lib/admin-game-catalogue'
import type {GameBuildManifest} from '@/lib/game-distribution/types'
import {publishedOnlineAccess} from '@/lib/server/publishedOnlineAccess'

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck

  const page=pageNumber(new URL(request.url).searchParams.get('page'))
  const params=new URL(request.url).searchParams,search=params.get('search')??'',status=params.get('status')??'all',type=params.get('type')??'all'
  if(search.length>80||!['all','published','hidden'].includes(status)||!['all','classic','multiplayer_chibasko'].includes(type))return adminJson({error:'Filtres invalides.'},{status:400})
  let query=supabaseAdmin.from('games').select('*, game_categories(category_id)',{count:'exact'})
  if(search)query=query.ilike('title','%'+search.replace(/[\\%_]/g,'\\$&')+'%')
  if(status!=='all')query=query.eq('is_published',status==='published')
  if(type!=='all')query=query.eq('game_type',type as 'classic'|'multiplayer_chibasko')
  const {data,error,count}=await query.order('created_at',{ascending:false}).order('id').range((page-1)*50,page*50-1)

  if (error||count===null) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  const games=data??[]
  const ids=games.flatMap(game=>game.active_version_id?[game.active_version_id]:[])
  type Version={id:string;game_id:string;version:string;manifest:GameBuildManifest}
  const versions=ids.length?await supabaseAdmin.from('game_versions' as never)
    .select('id,game_id,version,manifest').in('id',ids).eq('status','published'):null
  const byId=new Map(((versions?.data??[]) as unknown as Version[]).map(version=>[version.id,version]))
  const result=[]
  for(let i=0;i<games.length;i+=5){
    result.push(...await Promise.all(games.slice(i,i+5).map(async game=>{
      const version=game.active_version_id?byId.get(game.active_version_id):undefined
      if(!version||version.game_id!==game.id)return {...game,runtime:null}
      const runtime=catalogueRuntime(version.version,version.manifest)
      for(const access of runtime.declaredOnline){
        try{
          if(await publishedOnlineAccess(game.id,version.id,access))runtime.availableOnline.push(access)
        }catch{runtime.availabilityUnknown=true}
      }
      return {...game,runtime}
    })))
  }
  return adminJson({ games:result,total:count,page,pageSize:50 })
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  let validated: ReturnType<typeof validateGameCatalogue>
  try {
    validated = validateGameCatalogue(await readAdminJson(request))
  } catch (error) {
    return adminJson({ error: error instanceof CatalogueValidationError ? error.message : 'Formulaire invalide.' }, { status: 400 })
  }
  const { payload, categoryIds } = validated

  try {
    const {data, error} = await supabaseAdmin.rpc('admin_save_game' as never, {
      p_actor: adminCheck.user.id, p_game: payload, p_categories: categoryIds, p_id: null,
      p_expected_thumbnail: null,
    } as never)
    if (error) throw error
    return adminJson({game: (data as unknown as SavedCatalogueGame).game})
  } catch (error) { return catalogueFailure('admin_game_create', error) }
}

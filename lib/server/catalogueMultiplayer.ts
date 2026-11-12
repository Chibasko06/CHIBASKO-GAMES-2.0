import 'server-only'
import {cache} from 'react'
import {publishedOnlineAccess} from './publishedOnlineAccess'
import type {MultiplayerPresentation,OnlineAccess} from '../multiplayer/presentation'

const verifyAccess=cache(async(gameId:string,versionId:string,access:OnlineAccess)=>{
  try{return await publishedOnlineAccess(gameId,versionId,access)}catch{return false}
})

export async function catalogueOnlineAccess(game:MultiplayerPresentation&{id:string}):Promise<OnlineAccess[]> {
  const version=game.active_version_id
  const online=game.runtime_capabilities?.online
  if(!version||!online)return []
  const checks=await Promise.all(online.access.map(async access=>await verifyAccess(game.id,version,access)?access:null))
  return checks.filter(access=>access!==null)
}

export async function withCatalogueOnlineAccess<T extends MultiplayerPresentation&{id:string}>(game:T){
  return {...game,availableOnline:await catalogueOnlineAccess(game)}
}

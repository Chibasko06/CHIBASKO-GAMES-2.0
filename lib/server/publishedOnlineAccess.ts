import 'server-only'
import { uploadRepository } from '../game-distribution/uploads/repository'
export async function publishedOnlineAccess(gameId:string,versionId:string,access:'public'|'private') {
 const db=uploadRepository(process.env.NEXT_PUBLIC_SUPABASE_URL??'',process.env.SUPABASE_SERVICE_ROLE_KEY??'')
 return db.call<boolean>('distribution_multiplayer_access',{p_game:gameId,p_version:versionId,p_access:access})
}

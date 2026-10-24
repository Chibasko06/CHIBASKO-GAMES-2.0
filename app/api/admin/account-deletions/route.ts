import type {NextRequest} from 'next/server'
import {requireAdmin,adminJson} from '../_utils'
import {accountDeletionDependencies,deletionUnavailable} from '@/lib/server/accountDeletion'
export async function GET(request:NextRequest){
 const access=await requireAdmin(request);if('error' in access)return access.error
 try{return adminJson({deletions:await accountDeletionDependencies().db.call('distribution_account_list',{p_actor:access.user.id})})}
 catch{return deletionUnavailable()}
}

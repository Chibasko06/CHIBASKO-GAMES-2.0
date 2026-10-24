import {readData} from '@/lib/dataAccess'
import { Tables } from '@/types/database'
import { supabase } from '../supabaseClient'
import {DataAccessError} from '../dataAccess'

type Game = Tables<'games'>

export async function getRecentPlayHistory(userId:string,limit=5){
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new DataAccessError('unexpected_error')
 const {data}=await readData('recent_play_history',supabase.rpc('catalogue_recent_history' as never,{p_user:userId,p_limit:limit} as never))
 if(!Array.isArray(data))throw new DataAccessError('unexpected_error')
 return data as {historyId:string;played_at:string;game:Game}[]
}

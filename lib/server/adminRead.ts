import type {SupabaseClient,User} from '@supabase/supabase-js'
import {DataAccessError,readData} from '../dataAccess'

export async function readAuthUsers(db:SupabaseClient){
 const users:User[]=[]
 for(let page=1;page<=500;page++){
  const {data}=await readData('admin_auth_users',db.auth.admin.listUsers({page,perPage:100}))
  users.push(...data.users)
  if(data.users.length<100)return users
 }
 throw new DataAccessError('unexpected_error')
}


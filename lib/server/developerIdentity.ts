import 'server-only'
import {createUserAuthClient} from './adminAuthorization'
import {UploadError} from '../game-distribution/uploads/policy'
export async function authenticateDeveloper(request:Request){
 const header=request.headers.get('authorization')
 if(!header?.startsWith('Bearer ')||header.length>8192)throw new UploadError('unauthorized',401)
 const token=header.slice(7),{data,error}=await createUserAuthClient(token).auth.getUser(token)
 if(error||!data.user)throw new UploadError('unauthorized',401)
 return data.user.id
}

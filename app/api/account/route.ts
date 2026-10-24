import {createUserAuthClient} from '@/lib/server/adminAuthorization'
import {adminOriginAllowed} from '@/lib/server/adminRequest'
import {requestAccountDeletion,deletionUnavailable} from '@/lib/server/accountDeletion'
import {withTimeout} from '@/lib/asyncOperation'

export async function DELETE(request:Request){
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
 if(!adminOriginAllowed(request))return Response.json({error:'Origine refusée.'},{status:403,headers})
 const authorization=request.headers.get('authorization')
 if(!authorization?.startsWith('Bearer ')||authorization.length>8192)return Response.json({error:'Connexion requise.'},{status:401,headers})
 try{
  const token=authorization.slice(7),{data,error}=await withTimeout(createUserAuthClient(token).auth.getUser(token))
  if(error||!data.user)return Response.json({error:'Connexion requise.'},{status:401,headers})
  // La cible ne provient jamais du corps de la requête.
  return await requestAccountDeletion(data.user.id,data.user.id)
 }catch{return deletionUnavailable()}
}

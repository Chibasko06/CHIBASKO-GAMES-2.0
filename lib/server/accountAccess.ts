import 'server-only'
import {InputError} from './inputValidation'
import {withTimeout} from '@/lib/asyncOperation'

export class AccountRestrictedError extends InputError{
 constructor(){super('Ce compte fait l’objet d’une restriction. Consulte les décisions et recours depuis ton compte.',403)}
}
export async function assertAccountAccess(actor:string,client:unknown){
 const db=client as {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}
 const {data,error}=await withTimeout(db.rpc('distribution_account_access',{p_actor:actor}))
 if(error)throw error
 if(typeof data!=='boolean')throw Error('account_access_invalid')
 if(data!==true)throw new AccountRestrictedError()
}

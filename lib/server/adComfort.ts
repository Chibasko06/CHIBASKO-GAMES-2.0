import 'server-only'
import {cookies} from 'next/headers'
export async function adComfortVisible(){
 const jar=await cookies(),until=Number(jar.get('cg-advice-until')?.value)
 return !Number.isFinite(until)||until<=Date.now()
}

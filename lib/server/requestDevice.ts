import 'server-only'
import {cookies,headers} from 'next/headers'
import {initialDevice} from '@/lib/gameCompatibility'
export async function requestDevice(){
 const [jar,head]=await Promise.all([cookies(),headers()])
 return initialDevice(head.get('user-agent')??'',head.get('sec-ch-ua-mobile'),jar.get('cg-catalogue-filter')?.value)
}

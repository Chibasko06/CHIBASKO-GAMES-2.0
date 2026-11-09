import type {NextRequest} from 'next/server'
import {mutateFaq} from '@/lib/server/adminFaq'
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){return mutateFaq(request,(await params).id)}
export const DELETE=PATCH

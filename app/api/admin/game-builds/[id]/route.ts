import type {NextRequest} from 'next/server'
import {adminBuildRequest} from '@/lib/server/adminBuilds'
type Context={params:Promise<{id:string}>}
export async function GET(request:NextRequest,{params}:Context){return adminBuildRequest(request,(await params).id)}
export async function POST(request:NextRequest,{params}:Context){return adminBuildRequest(request,(await params).id)}

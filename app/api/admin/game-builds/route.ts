import type {NextRequest} from 'next/server'
import {adminBuildRequest} from '@/lib/server/adminBuilds'
export async function GET(request:NextRequest){return adminBuildRequest(request)}

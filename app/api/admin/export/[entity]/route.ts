import {readAuthUsers} from '@/lib/server/adminRead'
import {readAllRows} from '@/lib/pagination'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, adminJson, adminErrorMessage } from '../../_utils'

import {toCsv} from '@/lib/server/csv'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { entity } = await params
  const { supabaseAdmin } = adminCheck

  if (entity === 'games') {
    const { data, error } = await readAllRows('export_games',(from,to)=>supabaseAdmin.from('games').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(from,to)).then(data=>({data,error:null}),error=>({data:null,error}))

    if (error) {
      return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
    }

    return new NextResponse(toCsv(data || []), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Cookie, Authorization',
        'Content-Disposition': 'attachment; filename="games-export.csv"',
      },
    })
  }

  if (entity === 'users') {
    const [{ data: profiles, error: profilesError }, { data: authUsers, error: authError }] =
      await Promise.all([
        readAllRows('export_profiles',(from,to)=>supabaseAdmin.from('profiles').select('id, username, display_name, avatar_url, bio, created_at',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(from,to)).then(data=>({data,error:null}),error=>({data:[],error})),
        readAuthUsers(supabaseAdmin).then(users=>({data:{users},error:null}),error=>({data:{users:[]},error})),
      ])

    if (profilesError) {
      return adminJson({ error: adminErrorMessage(profilesError) }, { status: 500 })
    }

    if (authError) {
      return adminJson({ error: adminErrorMessage(authError) }, { status: 500 })
    }

    const emailById = new Map(
      (authUsers.users || []).map((user) => [user.id, user.email ?? null])
    )

    const rows = (profiles || []).map((profile) => ({
      ...profile,
      email: emailById.get(profile.id) ?? '',
    }))

    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Cookie, Authorization',
        'Content-Disposition': 'attachment; filename="users-export.csv"',
      },
    })
  }

  return adminJson({ error: 'Unknown export entity' }, { status: 400 })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_utils'

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return ''
  }

  const headers = Object.keys(rows[0])
  const escapeCell = (value: unknown) =>
    `"${String(value ?? '').replaceAll('"', '""')}"`

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(',')),
  ]

  return lines.join('\n')
}

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
    const { data, error } = await supabaseAdmin.from('games').select('*').order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return new NextResponse(toCsv(data || []), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="games-export.csv"',
      },
    })
  }

  if (entity === 'users') {
    const [{ data: profiles, error: profilesError }, { data: authUsers, error: authError }] =
      await Promise.all([
        supabaseAdmin.from('profiles').select('*').order('created_at', { ascending: false }),
        supabaseAdmin.auth.admin.listUsers(),
      ])

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
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
        'Content-Disposition': 'attachment; filename="users-export.csv"',
      },
    })
  }

  return NextResponse.json({ error: 'Unknown export entity' }, { status: 400 })
}

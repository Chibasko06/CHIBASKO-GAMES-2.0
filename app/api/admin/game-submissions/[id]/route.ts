import { NextRequest } from 'next/server'
import { requireAdmin, readAdminJson, adminJson, adminErrorMessage } from '../../_utils'

const allowedStatuses = new Set(['pending', 'reviewing', 'accepted', 'rejected', 'archived'])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  let body: Record<string, unknown>
  try { body = await readAdminJson(request) }
  catch { return adminJson({ error: 'Formulaire invalide.' }, { status: 400 }) }
  const { id } = await params

  const status = typeof body.status === 'string' ? body.status.trim() : ''
  const adminNotes = typeof body.admin_notes === 'string' ? body.admin_notes.trim() : ''

  if (!allowedStatuses.has(status)) {
    return adminJson({ error: 'Statut invalide.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('game_submissions')
    .update({
      status,
      admin_notes: adminNotes || null,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ submission: data })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request)

  if ('error' in adminCheck) {
    return adminCheck.error
  }

  const { supabaseAdmin } = adminCheck
  const { id } = await params

  const { error } = await supabaseAdmin
    .from('game_submissions')
    .delete()
    .eq('id', id)

  if (error) {
    return adminJson({ error: adminErrorMessage(error) }, { status: 500 })
  }

  return adminJson({ success: true })
}
